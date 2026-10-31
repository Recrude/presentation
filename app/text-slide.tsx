import type { CSSProperties } from 'react';
import type { Slide } from './model';
import { defaultTypography } from './model';
import { condenseAdvance, family, paragraphs, runStyles, runs } from './composite';
// Live text in the editor. The public viewer shows the SVG outlines made from this same layout.
// 장평 cannot scale inline glyphs in CSS, so a condensed run only gives back the advance it would
// lose (exact for monospaced Hangul); the published outlines are condensed exactly.
export function TextBody({ slide }: { slide: Slide }) {
  const t = slide.typo || defaultTypography;
  const vars = { '--size': t.size, '--leading': t.leading, '--paragraph': t.paragraph, '--tracking': t.tracking, '--top': t.top, '--left': t.left, '--right': t.right } as CSSProperties;
  return <div className="text-frame">
    <div className="text-body" style={vars}>
      {paragraphs(slide.text || '').map((p, i) => <p key={i}>
        {runs(p).map((r, j) => {
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
