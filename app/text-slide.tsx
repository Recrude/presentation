import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Slide } from './model';
import { defaultTypography } from './model';
import { condenseAdvance, family, paragraphs, runStyles, runs } from './composite';
// Live text in the editor. The public viewer shows the SVG outlines made from this same layout.
// 장평 cannot scale inline glyphs in CSS, so a condensed run only gives back the advance it would
// lose (exact for monospaced Hangul); the published outlines are condensed exactly.
export function TextBody({ slide }: { slide: Slide }) {
  const t = slide.typo || defaultTypography, bold = t.composite === 'bold';
  const frame = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const align = () => alignInk(element);
    align();
    const observer = new ResizeObserver(align);
    observer.observe(element);
    document.fonts.addEventListener('loadingdone', align);
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', align); };
  }, [slide.text, t]);
  const vars = { '--size': t.size, '--leading': t.leading, '--paragraph': t.paragraph, '--tracking': t.tracking, '--top': t.top, '--left': t.left, '--right': t.right } as CSSProperties;
  return <div className="text-frame" ref={frame}>
    <div className="text-body" style={vars}>
      {paragraphs(slide.text || '').map((p, i) => <p key={i}>
        {runs(p, bold).map((r, j) => {
          const style = runStyles[r.style];
          return <span key={j} data-run={r.style} style={{
            fontFamily: `'${family(style.font)}'`,
            fontSize: style.scale === 1 ? undefined : `${style.scale}em`,
            top: style.shift ? `${style.shift}em` : undefined,
            letterSpacing: style.hscale === 1 ? undefined : `calc(var(--track) + ${((style.hscale - 1) * condenseAdvance(r.style)).toFixed(4)}em)`,
          }}>{r.text}</span>;
        })}
      </p>)}
    </div>
  </div>;
}

let canvas: CanvasRenderingContext2D | null | undefined;
// Ink extents of one glyph in em, from the same face the page uses.
function ink(char: string, font: string) {
  canvas ??= document.createElement('canvas').getContext('2d');
  if (!canvas) return { ascent: 0, left: 0 };
  canvas.font = `1000px "${family(font)}"`;
  const m = canvas.measureText(char);
  return { ascent: m.actualBoundingBoxAscent / 1000, left: -m.actualBoundingBoxLeft / 1000 };
}
/**
 * Top and left margins are measured to the ink, as the eye reads them: the first line's letters touch
 * the top margin and the leftmost glyph that starts a line touches the left one, so equal values look
 * equal at any size or leading. Quotes, brackets and symbols overshoot, so they set the top only on a
 * line without letters or digits. The offset is kept in sheet px (1920 wide), so thumbnails, the
 * editor and the outlines agree. Moving the text never changes where lines wrap.
 */
export function alignInk(frame: HTMLElement) {
  const body = frame.firstElementChild as HTMLElement | null, first = body?.querySelector('p'), unit = frame.clientWidth / 1920;
  if (!body || !unit) return;
  let x = 0, y = 0;
  if (first) {
    const spans = [...body.querySelectorAll<HTMLElement>('[data-run]')];
    // Until a face has loaded the canvas would measure a fallback; loadingdone measures again.
    if (spans.some(span => !document.fonts.check(`16px "${family(runStyles[Number(span.dataset.run)].font)}"`, span.textContent || ''))) return;
    const css = getComputedStyle(body), box = body.getBoundingClientRect(), range = document.createRange();
    const top = box.top + parseFloat(css.paddingTop), left = box.left + parseFloat(css.paddingLeft), end = top + parseFloat(css.lineHeight);
    // The first line's baseline, from a zero-size marker at the start of the paragraph (it cannot change the wrap).
    const marker = document.createElement('i');
    marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    first.prepend(marker);
    const baseline = marker.getBoundingClientRect().bottom;
    marker.remove();
    let letters = Infinity, any = Infinity, edge = Infinity, previous = Infinity, lineStart = true;
    for (const span of spans) {
      const text = span.firstChild as Text | null, style = runStyles[Number(span.dataset.run)], size = parseFloat(getComputedStyle(span).fontSize);
      if (!text) continue;
      let offset = 0;
      for (const char of text.data) {
        range.setStart(text, offset); range.setEnd(text, offset += char.length);
        const rect = range.getClientRects()[0];
        if (!rect) continue;
        // Text runs left to right, so a step back is a new line (a wrap or a new paragraph).
        if (rect.left < previous - 0.5) lineStart = true;
        previous = rect.left;
        if (/\s/.test(char)) continue;
        const glyph = ink(char, style.font);
        if (lineStart && rect.left - left < 0.5) edge = Math.min(edge, rect.left + glyph.left * size);
        lineStart = false;
        if ((rect.top + rect.bottom) / 2 > end) continue;
        const inkTop = baseline + (style.shift - glyph.ascent) * size;
        any = Math.min(any, inkTop);
        if (/[\p{L}\p{N}]/u.test(char)) letters = Math.min(letters, inkTop);
      }
    }
    if (edge < Infinity) x = (edge - left) / unit;
    if (any < Infinity) y = ((letters < Infinity ? letters : any) - top) / unit;
  }
  frame.style.setProperty('--ink-x', x.toFixed(2));
  frame.style.setProperty('--ink-y', y.toFixed(2));
}
