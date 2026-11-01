import { chronologicalPages, projectForPage } from './chronology.ts';
export type Photo = { id: string; name: string; width: number; height: number };
// Text slide measurements are px on the 1920-wide sheet; tracking is 1/1000 em like InDesign.
// top and left are measured to the ink of the first line (see alignInk in text-slide.tsx).
// tabSize is the distance between tab stops in px from the left margin (default 240); indent is a
// hanging indent: lines after a paragraph's first start there, and it is a tab stop too (InDesign:
// left indent with a negative first line). tabs are explicit stops, kept for slides that have them.
export type Typography = { size: number; leading: number; paragraph: number; tracking: number; top: number; left: number; right: number; composite?: 'bold'; tabs?: number[]; indent?: number; tabSize?: number };
export const DEFAULT_TAB = 240;
// Sheet formats per presentation. Every measurement stays in px on a 1920-wide sheet; only the height changes.
export const FORMATS = { '16:9': { label: '16:9', height: 1080 }, '16:10': { label: '16:10', height: 1200 }, '4:3': { label: '4:3', height: 1440 }, iso: { label: '√2 포트폴리오', height: 1358 } } as const;
export type Format = keyof typeof FORMATS;
export const isFormat = (value: unknown): value is Format => typeof value === 'string' && Object.hasOwn(FORMATS, value);
export const sheetHeight = (format?: Format) => FORMATS[format || '16:9'].height;
export type Slide = {
  id: string;
  title: string;
  kind: 'image' | 'web' | 'youtube' | 'gallery' | 'folio' | 'video' | 'text' | 'sequence' | 'clip';
  src: string;
  hidden: boolean;
  photos?: Photo[];
  previewId?: string;
  folioPalette?: { background: string; foreground: string };
  autoplay?: boolean;
  controls?: boolean;
  muted?: boolean;
  text?: string;
  typo?: Typography;
  media?: Photo;
  interval?: number;
  /** Sequence: images shown together per step, laid out like a gallery. */
  perFrame?: number;
  /** Web: show the page inside a Safari-like window. */
  frame?: 'browser';
  /** Space around the slide's content in px on the 1920 sheet (text slides use their own margins). */
  margin?: number;
  /** Several images: how they share the sheet (see layoutPhotos). */
  layout?: Arrangement['layout'];
  fit?: Arrangement['fit'];
  gap?: number;
  /** Web: Safari's toolbar color for the page in the light and dark color schemes (read when captured). */
  tint?: string;
  tintDark?: string;
  end?: 'loop' | 'hold' | 'next';
  advance?: number;
  transition?: 'dissolve';
};
export const defaultTypography: Typography = { size: 64, leading: 100, paragraph: 100, tracking: -25, top: 96, left: 96, right: 96, composite: 'bold' };
/** Outer margin when a slide sets none: image sets and sequences keep 64, the Safari window 48, the rest bleed. */
export const defaultMargin = (s: Pick<Slide, 'kind' | 'frame'>) => s.kind === 'gallery' || s.kind === 'sequence' ? 64 : s.kind === 'web' && s.frame === 'browser' ? 48 : 0;
export const SEQUENCE_LIMIT = 200;
/** Images laid out together on one sheet (an image set, or a sequence switched to 격자). */
export const GALLERY_LIMIT = 60;
// Published asset formats. Text slides publish as SVG outlines, clips as MP4/WebM.
export const assetTypes: Record<string, string> = Object.assign(Object.create(null), { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm' });
export const MAX_ASSET = 40 * 1024 * 1024;
export function assetIds(slides: Slide[]) {
  return [...new Set(slides.flatMap(s => [...(s.photos?.map(p => p.id) || []), ...(s.media ? [s.media.id] : []), ...(s.previewId ? [s.previewId] : [])]))];
}
export const initial: Slide[] = chronologicalPages.map(i => {
  const project = projectForPage(i);
  return { id: `original-${i}`, title: project ? `${project.start} · ${project.title} · ${i - project.first + 1}` : i === 0 ? '표지' : i === 1 ? '원본 목차' : '마지막 장', kind: 'image', src: `/slides/page-${String(i).padStart(2, '0')}.webp`, hidden: false };
});
export function reorder(
  slides: Slide[],
  id: string,
  insertion: number,
): Slide[] {
  const from = slides.findIndex((s) => s.id === id);
  if (
    from < 0 ||
    !Number.isInteger(insertion) ||
    insertion < 0 ||
    insertion > slides.length
  )
    return slides;
  const next = [...slides];
  const [slide] = next.splice(from, 1);
  next.splice(insertion > from ? insertion - 1 : insertion, 0, slide);
  return next.every((s, i) => s === slides[i]) ? slides : next;
}
// Moves several slides together to an insertion index of the current order, keeping their order.
export function reorderMany(slides: Slide[], ids: string[], insertion: number): Slide[] {
  if (!Number.isInteger(insertion) || insertion < 0 || insertion > slides.length) return slides;
  const moving = new Set(ids), block = slides.filter(s => moving.has(s.id));
  if (!block.length) return slides;
  const rest = (from: number, to: number) => slides.slice(from, to).filter(s => !moving.has(s.id));
  const next = [...rest(0, insertion), ...block, ...rest(insertion, slides.length)];
  return next.every((s, i) => s === slides[i]) ? slides : next;
}
export function numberOf(slides: Slide[], id: string): number | null {
  const i = slides.filter((s) => !s.hidden).findIndex((s) => s.id === id);
  return i < 0 ? null : i + 1;
}
export function embed(raw: string) {
  const match = raw.match(/src\s*=\s*["']([^"']+)/i);
  let u: URL;
  try {
    u = new URL(match ? match[1].replace(/&amp;/g, '&') : raw.trim());
  } catch {
    throw Error('주소를 확인하세요.');
  }
  if (u.protocol !== 'https:' || u.username || u.password)
    throw Error('https:// 주소를 입력하세요.');
  const host = u.hostname.replace(/^www\./, '');
  if (
    [
      'youtube.com',
      'youtube-nocookie.com',
      'youtu.be',
      'm.youtube.com',
    ].includes(host)
  ) {
    const id =
      host === 'youtu.be'
        ? u.pathname.slice(1)
        : u.searchParams.get('v') ||
          u.pathname.split('/').filter(Boolean).pop();
    if (!id || !/^[-\w]{11}$/.test(id))
      throw Error('유튜브 영상 주소를 확인하세요.');
    return {
      kind: 'youtube' as const,
      src: `https://www.youtube-nocookie.com/embed/${id}`,
    };
  }
  return { kind: 'web' as const, src: u.href };
}
export function youtubeUrl(s: Slide, playing: boolean) {
  const u = new URL(s.src);
  u.searchParams.set('autoplay', playing && s.autoplay !== false ? '1' : '0');
  u.searchParams.set('controls', '1');
  u.searchParams.set('mute', playing && s.muted !== false ? '1' : '0');
  u.searchParams.set('playsinline', '1');
  u.searchParams.set('rel', '0');
  return u.href;
}
/** How several images share a sheet. Missing values keep the original image-set layout (equal cells). */
export type Arrangement = { layout?: 'rows' | 'columns' | 'cells'; fit?: 'contain' | 'cover'; gap?: number };
export const ARRANGEMENTS = [['rows', '높이 통일'], ['columns', '너비 통일'], ['cells', '칸']] as const;
export const DEFAULT_GAP = 24;
type Box = { x: number; y: number; width: number; height: number };
/**
 * Lays images out inside the sheet (1920 × H) less a margin, with equal gaps between them.
 * - rows: one height for every image, rows in order; contain centres each row, cover stretches
 *   rows to the full width and height (cropping).
 * - columns: one width for every image, each image into the shortest column; contain centres each
 *   column, cover stretches columns to the full height and width.
 * - cells: equal cells; contain fits each image in its cell, cover fills the cell.
 * The number of rows, columns or cells is the one that shows the images largest (contain) or crops
 * them least (cover).
 */
export function layoutPhotos(photos: Pick<Photo, 'width' | 'height'>[], H = 1080, { layout = 'cells', fit = 'contain', gap = DEFAULT_GAP }: Arrangement = {}, margin = 64): Box[] {
  const n = photos.length, W = 1920 - margin * 2, V = H - margin * 2;
  if (!n || W <= 0 || V <= 0) return [];
  const aspect = photos.map(p => p.width / p.height), cover = fit === 'cover';
  if (layout === 'rows' || layout === 'columns') {
    // Columns are rows of the transposed sheet: swap the axes, lay out rows, swap back.
    const across = layout === 'rows' ? W : V, along = layout === 'rows' ? V : W;
    const a = layout === 'rows' ? aspect : aspect.map(r => 1 / r);
    const lines = layout === 'rows' ? splitRows(a, across, along, gap) : packColumns(a, across, along, gap);
    const size = Math.min(...lines.map(line => (across - (line.length - 1) * gap) / sum(line.map(i => a[i]))), (along - (lines.length - 1) * gap) / lines.length);
    const lineSize = cover ? (along - (lines.length - 1) * gap) / lines.length : size;
    const boxes: Box[] = [];
    let offset = (along - lines.length * lineSize - (lines.length - 1) * gap) / 2;
    for (const line of lines) {
      const natural = sum(line.map(i => a[i])) * size + (line.length - 1) * gap;
      const stretch = cover ? (across - (line.length - 1) * gap) / (natural - (line.length - 1) * gap) : 1;
      let cursor = cover ? 0 : (across - natural) / 2;
      for (const i of line) {
        const length = a[i] * size * stretch;
        boxes[i] = layout === 'rows'
          ? { x: margin + cursor, y: margin + offset, width: length, height: lineSize }
          : { x: margin + offset, y: margin + cursor, width: lineSize, height: length };
        cursor += length + gap;
      }
      offset += lineSize + gap;
    }
    return boxes;
  }
  let best: Box[] = [], score = -Infinity;
  for (let columns = 1; columns <= n; columns++) {
    const rows = Math.ceil(n / columns), cw = (W - gap * (columns - 1)) / columns, ch = (V - gap * (rows - 1)) / rows;
    if (cw <= 0 || ch <= 0) continue;
    const boxes = aspect.map((ratio, i) => {
      const width = cover ? cw : Math.min(cw, ch * ratio), height = cover ? ch : width / ratio;
      const row = Math.floor(i / columns), count = Math.min(columns, n - row * columns);
      return { x: margin + (W - count * cw - (count - 1) * gap) / 2 + (i % columns) * (cw + gap) + (cw - width) / 2, y: margin + row * (ch + gap) + (ch - height) / 2, width, height };
    });
    const value = cover ? -sum(aspect.map(r => Math.abs(Math.log(cw / ch / r)))) : sum(boxes.map(b => b.width * b.height));
    if (value > score) { score = value; best = boxes; }
  }
  return best;
}
const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);
// Splits images in order into rows so that one shared height is as large as possible: for every row
// count, the split that keeps the widest row (aspect sum against its room) narrowest.
function splitRows(a: number[], across: number, along: number, gap: number) {
  const n = a.length, prefix = [0];
  for (const r of a) prefix.push(prefix.at(-1)! + r);
  const cost = (from: number, to: number) => { const room = across - (to - from - 1) * gap; return room > 0 ? (prefix[to] - prefix[from]) / room : Infinity; };
  // worst[k][j]: the smallest possible widest-row cost for the first j images in k rows.
  const worst = [Array(n + 1).fill(Infinity)], cut: number[][] = [[]];
  worst[0][0] = 0;
  let bestRows = 1, bestSize = 0;
  for (let k = 1; k <= n; k++) {
    worst[k] = Array(n + 1).fill(Infinity); cut[k] = [];
    for (let j = k; j <= n; j++)
      for (let i = k - 1; i < j; i++) {
        const value = Math.max(worst[k - 1][i], cost(i, j));
        if (value < worst[k][j]) { worst[k][j] = value; cut[k][j] = i; }
      }
    const size = Math.min(1 / worst[k][n], (along - (k - 1) * gap) / k);
    if (size > bestSize) { bestSize = size; bestRows = k; }
  }
  const rows: number[][] = [];
  for (let k = bestRows, j = n; k > 0; k--) { const i = cut[k][j]; rows.unshift(Array.from({ length: j - i }, (_, t) => i + t)); j = i; }
  return rows;
}
// Puts each image into the currently shortest column; the column count is the one that gives the
// largest shared width.
function packColumns(a: number[], across: number, along: number, gap: number) {
  let best: number[][] = [[]], bestSize = 0;
  for (let c = 1; c <= a.length; c++) {
    const room = (along - (c - 1) * gap) / c;
    if (room <= 0) break;
    const columns: number[][] = Array.from({ length: c }, () => []), length = Array(c).fill(-gap);
    a.forEach((r, i) => { const j = length.indexOf(Math.min(...length)); columns[j].push(i); length[j] += room * r + gap; });
    const size = Math.min(room, ...columns.map(column => (across - (column.length - 1) * gap) / sum(column.map(i => a[i]))));
    if (size > bestSize) { bestSize = size; best = columns; }
  }
  return best;
}
const validPhoto = (p: Photo) =>
  !!p &&
  typeof p.id === 'string' &&
  typeof p.name === 'string' &&
  Number.isFinite(p.width) &&
  p.width > 0 &&
  Number.isFinite(p.height) &&
  p.height > 0;
const within = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function validTypography(t: Typography | undefined): t is Typography {
  return !!t && within(t.size, 8, 400) && within(t.leading, 8, 800) && within(t.paragraph, 0, 1000) && within(t.tracking, -300, 1000) &&
    within(t.top, 0, 1000) && within(t.left, 0, 1800) && within(t.right, 0, 1800) && t.left + t.right <= 1800 &&
    (t.composite === undefined || t.composite === 'bold') &&
    (t.tabs === undefined || Array.isArray(t.tabs) && t.tabs.length <= 24 && t.tabs.every((v, i) => within(v, 1, 1800) && (i === 0 || v > t.tabs![i - 1]))) &&
    (t.indent === undefined || within(t.indent, 0, 1800)) &&
    (t.tabSize === undefined || within(t.tabSize, 8, 1800));
}
export function validDeck(value: unknown): value is Slide[] {
  return (
    Array.isArray(value) &&
    value.length <= 2000 &&
    new Set(value.map((s) => s?.id)).size === value.length &&
    value.every((s) => {
      if (
        !s ||
        typeof s.id !== 'string' ||
        typeof s.title !== 'string' ||
        typeof s.hidden !== 'boolean' ||
        typeof s.src !== 'string' ||
        (s.advance !== undefined && !within(s.advance, 0.1, 3600)) ||
        (s.transition !== undefined && s.transition !== 'dissolve') ||
        (s.previewId !== undefined && typeof s.previewId !== 'string') ||
        (s.frame !== undefined && (s.frame !== 'browser' || s.kind !== 'web')) ||
        [s.tint, s.tintDark].some(t => t !== undefined && (s.kind !== 'web' || typeof t !== 'string' || !/^#[0-9a-f]{6}$/.test(t))) ||
        (s.margin !== undefined && !within(s.margin, 0, 480)) ||
        ((s.layout !== undefined || s.fit !== undefined || s.gap !== undefined) && s.kind !== 'gallery' && s.kind !== 'sequence') ||
        (s.layout !== undefined && !['rows', 'columns', 'cells'].includes(s.layout)) ||
        (s.fit !== undefined && !['contain', 'cover'].includes(s.fit)) ||
        (s.gap !== undefined && !within(s.gap, 0, 400))
      )
        return false;
      if (s.kind === 'image')
        return /^\/slides\/page-(?:[0-6]\d|7[0-8])\.webp$/.test(s.src);
      if (s.kind === 'text')
        return typeof s.text === 'string' && s.text.length <= 10000 && validTypography(s.typo);
      if (s.kind === 'sequence')
        return Array.isArray(s.photos) && s.photos.length > 0 && s.photos.length <= SEQUENCE_LIMIT && s.photos.every(validPhoto) &&
          Number.isInteger(s.interval) && within(s.interval, 40, 10000) && ['loop', 'hold', 'next'].includes(s.end) &&
          (s.perFrame === undefined || Number.isInteger(s.perFrame) && within(s.perFrame, 1, 12));
      if (s.kind === 'clip')
        return validPhoto(s.media) && ['loop', 'hold', 'next'].includes(s.end);
      if (s.kind === 'gallery' || s.kind === 'folio')
        return (
          (s.kind !== 'folio' || (s.photos?.length === 1 && /^#[0-9a-fA-F]{6}$/.test(s.folioPalette?.background || '') && /^#[0-9a-fA-F]{6}$/.test(s.folioPalette?.foreground || ''))) &&
          Array.isArray(s.photos) &&
          s.photos.length > 0 &&
          s.photos.length <= GALLERY_LIMIT &&
          s.photos.every(validPhoto)
        );
      if (s.kind === 'video') return s.src === '/media/audio-morphology.mp4';
      if (s.kind === 'web' || s.kind === 'youtube') {
        try {
          const e = embed(s.src);
          return e.kind === s.kind;
        } catch {
          return false;
        }
      }
      return false;
    })
  );
}
