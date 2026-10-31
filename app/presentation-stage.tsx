import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Slide } from './model';
import { SlideView } from './slide-view';
import { usePresentationZoom } from './presentation-zoom';

type Frame = { slide: Slide; number: number };
const DISSOLVE_MS = 600;
export function PresentationStage({ slide, number, assets, outlined = false, onShown, onFinish }: Frame & {
  assets: Record<string, string>;
  outlined?: boolean;
  /** The slide is on screen (decoded and swapped in); auto-advance timing starts here. */
  onShown?: (id: string) => void;
  onFinish?: (id: string) => void;
}) {
  const [shown, setShown] = useState<Frame>({ slide, number });
  // The previous slide stays underneath while a dissolve brings in the new one.
  const [leaving, setLeaving] = useState<Frame | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const zoom = usePresentationZoom(shown.slide.id);
  const layers = useRef(new Map<string, HTMLDivElement>());
  const pending = shown.slide.id !== slide.id;
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    setLeaving(null);
    const target = layers.current.get(slide.id);
    const images = Array.from(target?.querySelectorAll('img') || []);
    // Decode the actual next layer while the previous layer stays on screen.
    // Failed images reveal SlideView's error state instead of blocking navigation.
    void Promise.all(images.map(image => image.decode().catch(() => undefined))).then(() => {
      if (cancelled) return;
      if (slide.transition === 'dissolve') setLeaving(shownRef.current);
      setShown({ slide, number });
    });
    return () => { cancelled = true; };
  }, [slide, number, pending, assets]);
  const shownCallback = useRef(onShown);
  shownCallback.current = onShown;
  useEffect(() => { shownCallback.current?.(shown.slide.id); }, [shown.slide.id]);
  useLayoutEffect(() => {
    if (!leaving) return;
    // Web Animations run even though the stylesheet disables CSS transitions and animations.
    const animation = layers.current.get(shown.slide.id)?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DISSOLVE_MS, easing: 'ease-in-out' });
    if (!animation) { setLeaving(null); return; }
    animation.onfinish = () => setLeaving(null);
    return () => animation.cancel();
  }, [leaving, shown.slide.id]);
  const frames = pending ? [shown, { slide, number }] : leaving && leaving.slide.id !== slide.id ? [leaving, { slide, number }] : [{ slide, number }];
  return <div className="presentation-stage" ref={zoom.viewport}>
    <div className="presentation-zoom" ref={zoom.content}>
    {frames.map(frame => {
      const active = frame.slide.id === shown.slide.id, fading = frame === leaving;
      return <div key={frame.slide.id}
        ref={node => { if (node) layers.current.set(frame.slide.id, node); else layers.current.delete(frame.slide.id); }}
        className="presentation-layer"
        style={{ visibility: active || fading ? 'visible' : 'hidden' }}
        aria-hidden={!active} inert={!active}>
        <SlideView slide={frame.slide} number={frame.number} assets={assets} live playing={active || fading} outlined={outlined}
          onFinish={active ? () => onFinish?.(frame.slide.id) : undefined}/>
      </div>;
    })}
    </div>
    {zoom.percent > 100 && <button className="zoom-reset" onClick={zoom.reset} aria-label="확대 초기화">{zoom.percent}% · 원래 크기</button>}
  </div>;
}
