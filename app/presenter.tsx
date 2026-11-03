import { useContext, useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Slide } from './model';
import { SheetHeight, SlideView } from './slide-view';
import { shareFonts } from './fonts';

// Window Management API (Chrome): every screen and the one this window is on.
type ScreenDetailed = Screen & { availLeft: number; availTop: number; isInternal: boolean };
type ScreenDetails = { screens: ScreenDetailed[]; currentScreen: ScreenDetailed };

/**
 * Full screen for the talk. With a second display (Chrome, once 창 관리 is allowed) the slides go full screen
 * there and the laptop's screen gets the presenter window, from the same click; with one display, or without
 * the permission, full screen here as before. 'again': the permission prompt took the click, press once more.
 */
export async function enterFullscreen(): Promise<Window | null | 'again'> {
  const root = document.documentElement, managed = window as Window & { getScreenDetails?: () => Promise<ScreenDetails> };
  if ((screen as Screen & { isExtended?: boolean }).isExtended && managed.getScreenDetails) {
    try {
      const { screens, currentScreen } = await managed.getScreenDetails();
      const desk = screens.find(s => s.isInternal) || currentScreen, room = screens.find(s => s !== desk);
      if (room) {
        if (!navigator.userActivation.isActive) return 'again';
        const entering = root.requestFullscreen({ screen: room } as FullscreenOptions & { screen: Screen });
        const presenter = openPresenter(desk);
        try { await entering; return presenter; }
        catch { presenter?.close(); }
      }
    } catch {}
  }
  await root.requestFullscreen().catch(() => {});
  return null;
}

// An empty window filling the presenter's screen, with this page's styles and fonts; PresenterView fills it.
function openPresenter(desk: ScreenDetailed) {
  const popup = window.open('', 'presenter', `popup,left=${desk.availLeft},top=${desk.availTop},width=${desk.availWidth},height=${desk.availHeight}`);
  if (!popup) return null;
  const doc = popup.document;
  // A doctype: an empty window is in quirks mode, where the slides' lines lose their height.
  doc.open();
  doc.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>발표자 화면</title></head><body></body></html>');
  doc.close();
  doc.head.append(...[...document.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')].map(node => {
    const copy = node.cloneNode(true) as HTMLElement;
    if (node instanceof HTMLLinkElement) (copy as HTMLLinkElement).href = node.href;
    return copy;
  }));
  shareFonts(doc);
  return popup;
}

/** The presenter window: where the talk is and how long it has run, the slide on screen and the next one. */
export function PresenterView({ popup, slides, position, assets, outlined }: {
  popup: Window;
  slides: Slide[];
  position: number;
  assets: Record<string, string>;
  outlined: boolean;
}) {
  const height = useContext(SheetHeight);
  const [start] = useState(Date.now), [now, setNow] = useState(start);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const seconds = Math.floor((now - start) / 1000), current = slides[position], next = slides[position + 1];
  return createPortal(<div className="presenter" style={{ '--sheet-ratio': 1920 / height } as CSSProperties}>
    <p>{position + 1} / {slides.length}</p>
    <p className="presenter-clock">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</p>
    <div className="presenter-sheet">{current && <SlideView key={current.id} slide={current} number={position + 1} assets={assets} outlined={outlined}/>}</div>
    <div className="presenter-next">
      {next ? <><div className="presenter-sheet"><SlideView key={next.id} slide={next} number={position + 2} assets={assets} outlined={outlined}/></div><p>다음</p></> : <p>마지막 장표</p>}
    </div>
  </div>, popup.document.body);
}
