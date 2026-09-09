import { useEffect, useRef, useState } from 'react';
import type { Slide } from './model';
import { SlideView } from './slide-view';
import { usePresentationZoom } from './presentation-zoom';

type Frame = { slide: Slide; number: number };
export function PresentationStage({ slide, number, assets }: Frame & { assets: Record<string, string> }) {
  const [shown, setShown] = useState<Frame>({ slide, number });
  const zoom = usePresentationZoom(shown.slide.id);
  const layers = useRef(new Map<string, HTMLDivElement>());
  const pending = shown.slide.id !== slide.id;
  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    const target = layers.current.get(slide.id);
    const images = Array.from(target?.querySelectorAll('img') || []);
    // Decode the actual next layer while the previous layer stays on screen.
    // Failed images reveal SlideView's error state instead of blocking navigation.
    void Promise.all(images.map(image => image.decode().catch(() => undefined))).then(() => {
      if (!cancelled) setShown({ slide, number });
    });
    return () => { cancelled = true; };
  }, [slide, number, pending, assets]);
  const frames = pending ? [shown, { slide, number }] : [{ slide, number }];
  return <div className="presentation-stage" ref={zoom.viewport}>
    <div className="presentation-zoom" ref={zoom.content}>
    {frames.map(frame => {
      const active = frame.slide.id === shown.slide.id;
      return <div key={frame.slide.id}
        ref={node => { if (node) layers.current.set(frame.slide.id, node); else layers.current.delete(frame.slide.id); }}
        className="presentation-layer"
        style={{ visibility: active ? 'visible' : 'hidden' }}
        aria-hidden={!active} inert={!active}>
        <SlideView slide={frame.slide} number={frame.number} assets={assets} live playing={active}/>
      </div>;
    })}
    </div>
    {zoom.percent > 100 && <button className="zoom-reset" onClick={zoom.reset} aria-label="확대 초기화">{zoom.percent}% · 원래 크기</button>}
  </div>;
}
