import table from './composite-font.json' with { type: 'json' };
// Composite font from the portfolio's InDesign document (scripts/composite-font.py).
// Each run is set in one face with that slot's scale and baseline shift.
export const FAMILY = { hangul: 'JK Composite Hangul', latin: 'JK Composite Latin' } as const;
export type FontKey = keyof typeof FAMILY;
export const POSTSCRIPT: Record<FontKey, string> = table.fonts;
export type RunStyle = { font: FontKey; scale: number; shift: number };
export const runStyles: RunStyle[] = [...table.classes, table.default].map(c => ({ font: c.font as FontKey, scale: c.scale, shift: c.shift }));
const DEFAULT = table.classes.length;
const ranges = table.classes.flatMap((c, i) => c.ranges.map(([start, end]) => [start, end, i])).sort((a, b) => a[0] - b[0]);
export function styleOf(codePoint: number) {
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1, [start, end, style] = ranges[mid];
    if (codePoint < start) high = mid - 1;
    else if (codePoint > end) low = mid + 1;
    else return style;
  }
  return DEFAULT;
}
export function runs(text: string) {
  const result: { style: number; text: string }[] = [];
  for (const char of text) {
    const style = styleOf(char.codePointAt(0)!), last = result.at(-1);
    if (last?.style === style) last.text += char;
    else result.push({ style, text: char });
  }
  return result;
}
// A blank line separates paragraphs; a single line break stays inside the paragraph.
export function paragraphs(text: string) {
  return text.split(/\n[ \t]*\n/).map(p => p.replace(/^\n+|\n+$/g, '')).filter(p => p.trim());
}
