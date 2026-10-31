import type { CSSProperties } from 'react';
import type { Slide } from './model';
import { defaultTypography } from './model';
import { FAMILY, paragraphs, runStyles, runs } from './composite';
// Live text in the editor. The public viewer shows the SVG outlines made from this same layout.
export function TextBody({ slide }: { slide: Slide }) {
  const t = slide.typo || defaultTypography;
  const vars = { '--size': t.size, '--leading': t.leading, '--paragraph': t.paragraph, '--tracking': t.tracking, '--top': t.top, '--left': t.left, '--right': t.right } as CSSProperties;
  return <div className="text-frame">
    <div className="text-body" style={vars}>
      {paragraphs(slide.text || '').map((p, i) => <p key={i}>
        {runs(p).map((r, j) => {
          const style = runStyles[r.style];
          return <span key={j} data-run={r.style} style={{ fontFamily: `'${FAMILY[style.font]}'`, fontSize: style.scale === 1 ? undefined : `${style.scale}em`, top: style.shift ? `${style.shift}em` : undefined }}>{r.text}</span>;
        })}
      </p>)}
    </div>
  </div>;
}
