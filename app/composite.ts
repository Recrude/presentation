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
export const COMPOSITES = (['regular', 'bold'] as const).map(weight => ({
  weight, name: (table.composites[weight] as { name: string }).name,
  // Display names of the Hangul and Latin faces, e.g. for the editor's font note.
  faces: [...new Set([composites[weight].hangul.font, composites[weight].alphabetic.font])].map(ps => LOCAL_NAMES[ps].at(-1)!),
}));
// `**굵게**` switches to the bold composite inside a paragraph; an unmatched `**` stays as typed.
// A slide set in the bold composite stays bold throughout.
export function runs(text: string, bold = false) {
  const parts = text.split('**');
  if (parts.length % 2 === 0) parts.splice(-2, 2, parts.at(-2) + '**' + parts.at(-1));
  const result: { style: number; text: string }[] = [];
  parts.forEach((part, i) => {
    for (const char of part) {
      const style = styleOf(char.codePointAt(0)!, bold || i % 2 === 1), last = result.at(-1);
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
export const fontsIn = (text: string, bold = false) => [...new Set(paragraphs(text).flatMap(p => runs(p, bold).map(r => runStyles[r.style].font)))];
// One character per category, so each style's baseline can be measured on its own line.
export const styleSample = (style: number) => ['가', '“', '×', 'A', '1', 'ㄱ'][style % CATEGORIES.length];
// Average advance (em) a condensed run gives back per glyph: Hangul faces are monospaced (1em),
// Latin varies, so 0.6em keeps the editor within ~0.004em per glyph of the condensed outlines.
export const condenseAdvance = (style: number) => [0, 5].includes(style % CATEGORIES.length) ? 1 : 0.6;
/**
 * Sets the characters typed in [start, end) of a text (offsets in it, `**` included) bold or regular,
 * or the other way when all its letters are already bold ('toggle'). The text comes back on a regular
 * base with `**` around its bold runs, inside each paragraph as runs reads them, spaces between bold
 * letters inside a run and spaces at its edges out; when every letter is bold it comes back without
 * marks and the slide is bold. start and end are the same characters' offsets in the new text.
 * Null when the range holds no letter.
 */
export function setWeight(text: string, slideBold: boolean, start: number, end: number, weight: 'bold' | 'regular' | 'toggle') {
  type Char = { char: string; bold: boolean; at: number };
  const read = (from: number, to: number) => {
    const p = text.slice(from, to), marks: number[] = [], chars: Char[] = [];
    for (let i = p.indexOf('**'); i >= 0; i = p.indexOf('**', i + 2)) marks.push(i);
    if (marks.length % 2) marks.pop();
    for (let i = 0, m = 0, inside = false; i < p.length;) {
      if (marks[m] === i) { inside = !inside; m++; i += 2; continue; }
      const char = String.fromCodePoint(p.codePointAt(i)!);
      chars.push({ char, bold: slideBold || inside, at: from + i });
      i += char.length;
    }
    return chars;
  };
  // Paragraphs as paragraphs() splits them, with their separators kept as typed.
  const parts: (Char[] | string)[] = [];
  let from = 0;
  for (const match of text.matchAll(/\n[ \t]*\n/g)) { parts.push(read(from, match.index), match[0]); from = match.index + match[0].length; }
  parts.push(read(from, text.length));
  const letter = (c: Char) => !!c.char.trim(), chars = parts.flatMap(p => typeof p === 'string' ? [] : p);
  const picked = chars.filter(c => c.at >= start && c.at < end);
  if (!picked.some(letter)) return null;
  const bold = weight === 'toggle' ? !picked.filter(letter).every(c => c.bold) : weight === 'bold';
  for (const c of picked) c.bold = bold;
  const allBold = chars.filter(letter).every(c => c.bold);
  let out = '', first = -1, last = -1;
  for (const p of parts) {
    if (typeof p === 'string') { out += p; continue; }
    // A space is bold when the letters on both sides are, so runs start and end on letters.
    const near = (i: number, step: number) => { for (let j = i; j >= 0 && j < p.length; j += step) if (letter(p[j])) return p[j].bold; return false; };
    let open = false;
    p.forEach((c, i) => {
      const marked = !allBold && (letter(c) ? c.bold : near(i, -1) && near(i, 1));
      if (marked !== open) { out += '**'; open = marked; }
      if (c.at >= start && c.at < end) { if (first < 0) first = out.length; last = out.length + c.char.length; }
      out += c.char;
    });
    if (open) out += '**';
  }
  return { text: out, bold: allBold, start: first, end: last };
}
