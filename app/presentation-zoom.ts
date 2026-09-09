import { useLayoutEffect, useRef, useState } from 'react';

type Gesture = Event & { scale: number; clientX: number; clientY: number };
export function usePresentationZoom(slideId: string) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const value = useRef({ scale: 1, x: 0, y: 0 });
  const [percent, setPercent] = useState(100);
  function apply(scale: number, x: number, y: number) {
    const box = viewport.current?.getBoundingClientRect();
    if (!box || !content.current) return;
    scale = Math.max(1, Math.min(4, scale));
    x = Math.max(box.width * (1 - scale), Math.min(0, x));
    y = Math.max(box.height * (1 - scale), Math.min(0, y));
    value.current = { scale, x, y };
    content.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    setPercent(Math.round(scale * 100));
  }
  function reset() { apply(1, 0, 0); }
  useLayoutEffect(() => {
    reset();
    const element = viewport.current;
    if (!element) return;
    let gesturing = false, initialScale = 1;
    const zoom = (scale: number, clientX: number, clientY: number) => {
      const box = element.getBoundingClientRect();
      const x = clientX - box.left, y = clientY - box.top;
      const previous = value.current;
      const next = Math.max(1, Math.min(4, scale));
      const ratio = next / previous.scale;
      apply(next, x - (x - previous.x) * ratio, y - (y - previous.y) * ratio);
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
        if (!gesturing) zoom(value.current.scale * Math.exp(-event.deltaY * .01), event.clientX, event.clientY);
      } else if (value.current.scale > 1) {
        event.preventDefault();
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
        apply(value.current.scale, value.current.x - event.deltaX * unit, value.current.y - event.deltaY * unit);
      }
    };
    const start = (event: Event) => { event.preventDefault(); gesturing = true; initialScale = value.current.scale; };
    const change = (event: Event) => {
      event.preventDefault();
      const gesture = event as Gesture;
      zoom(initialScale * gesture.scale, gesture.clientX, gesture.clientY);
    };
    const end = (event: Event) => { event.preventDefault(); gesturing = false; };
    const resize = () => apply(value.current.scale, value.current.x, value.current.y);
    element.addEventListener('wheel', wheel, { passive: false });
    element.addEventListener('gesturestart', start, { passive: false });
    element.addEventListener('gesturechange', change, { passive: false });
    element.addEventListener('gestureend', end, { passive: false });
    window.addEventListener('resize', resize);
    return () => {
      element.removeEventListener('wheel', wheel);
      element.removeEventListener('gesturestart', start);
      element.removeEventListener('gesturechange', change);
      element.removeEventListener('gestureend', end);
      window.removeEventListener('resize', resize);
    };
  }, [slideId]);
  return { viewport, content, percent, reset };
}
