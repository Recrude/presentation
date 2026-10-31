import table from './composite-font.json' with { type: 'json' };
// Composite fonts from the portfolio's InDesign document (scripts/composite-font.py): the body
// composite and its bold. Each run is set in one face with that category's size, baseline and 장평.
export const FONTS = Object.keys(table.fonts);
export const LOCAL_NAMES: Record<string, string[]> = table.fonts;
export const family = (postscript: string) => `JK ${postscript}`;
export type RunStyle = { font: string; scale: number; shift: number; hscale: number; bold: boolean };
const CATEGORIES = ['hangul', 'punctuation', 'symbols', 'alphabetic', 'numbers', 'base'] as const;
type Composite = Record<(typeof CATEGORIES)[number], Omit<RunStyle, 'bold'>>;
const composites = table.composites as unknown as Record<'regular' | 'bold', Composite>;
export const runStyles: RunStyle[] = (['regular', 'bold'] as const).flatMap(weight => CATEGORIES.map(c => ({ ...composites[weight][c], bold: weight === 'bold' })));
const BASE = CATEGORIES.length - 1;
const ranges = table.categories.flatMap((c, i) => c.ranges.map(([start, end]) => [start, end, i])).sort((a, b) => a[0] - b[0]);
export function categoryOf(codePoint: number) {
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1, [start, end, category] = ranges[mid];
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return category;
  }
  return BASE;
}
export const styleOf = (codePoint: number, bold = false) => categoryOf(codePoint) + (bold ? CATEGORIES.length : 0);
// `**굵게**` switches to the bold composite inside a paragraph; an unmatched `**` stays as typed.
export function runs(text: string) {
  const parts = text.split('**');
  if (parts.length % 2 === 0) parts.splice(-2, 2, parts.at(-2) + '**' + parts.at(-1));
  const result: { style: number; text: string }[] = [];
  parts.forEach((part, i) => {
    for (const char of part) {
      const style = styleOf(char.codePointAt(0)!, i % 2 === 1), last = result.at(-1);
      if (last?.style === style) last.text += char;
      else result.push({ style, text: char });
    }
  });
  return result;
}
// A blank line separates paragraphs; a single line break stays inside the paragraph.
export function paragraphs(text: string) {
  return text.split(/\n[ \t]*\n/).map(p => p.replace(/^\n+|\n+$/g, '')).filter(p => p.trim());
}
export const fontsIn = (text: string) => [...new Set(paragraphs(text).flatMap(p => runs(p).map(r => runStyles[r.style].font)))];
// One character per category, so each style's baseline can be measured on its own line.
export const styleSample = (style: number) => ['가', '“', '×', 'A', '1', 'ㄱ'][style % CATEGORIES.length];
// Average advance (em) a condensed run gives back per glyph: Hangul faces are monospaced (1em),
// Latin varies, so 0.6em keeps the editor within ~0.004em per glyph of the condensed outlines.
export const condenseAdvance = (style: number) => [0, 5].includes(style % CATEGORIES.length) ? 1 : 0.6;
