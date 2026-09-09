import font from './folio-glyphs.json';
export function FolioNumber({ number, fill }: { number: number | null; fill: string }) {
  if (number === null) return null;
  const text = String(number), scale = font.size / font.units;
  const glyphs = font.glyphs as Record<string, { path: string; advance: number }>;
  const kerning = font.kerning as Record<string, number>;
  let advance = 0;
  const letters = [...text].map((c, i) => {
    if (i) advance += kerning[text[i - 1] + c] || 0;
    const offset = advance; advance += glyphs[c].advance;
    return { glyph: glyphs[c], offset };
  });
  return <g aria-label={text} fill={fill} transform={`translate(${font.center - advance * scale / 2} ${font.baseline}) scale(${scale} ${-scale})`}>
    {letters.map(({ glyph, offset }, i) => <path key={i} d={glyph.path} transform={`translate(${offset} 0)`}/>)}
  </g>;
}
