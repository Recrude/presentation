import { chronologicalPages, projectForPage } from './chronology.ts';
/**
 * duration: in a sequence, seconds this image stays before the next one (the slide's interval when unset).
 * video: a muted video laid out like an image in a sequence or grid; its file is under id, a still frame
 * under poster (thumbnails, PDF, before playback) and its length in seconds is the step's default time.
 * from/to: the part of a video that plays (see Range); a clip's video keeps its range here too.
 * joined: in a sequence, shown in the same step as the image before it (see sequenceSteps).
 * caption: small text under the image in a grid or sequence (see CAPTION); captionId is its SVG
 * outlines for the public viewer, made again on every publish like a text slide's.
 */
export type Photo = { id: string; name: string; width: number; height: number; duration?: number; video?: true; poster?: string; length?: number; joined?: true; caption?: string; captionId?: string } & Range;
/** The part of a video that plays, in seconds: from its start (0) and to its end when unset. */
export type Range = { from?: number; to?: number };
export const ranged = (r: Range) => !!r.from || r.to !== undefined;
/** Vimeo's player (player.vimeo.com/video/<id>), the one web page whose range the editor controls. */
export function vimeoPlayer(src: string) {
  try { const u = new URL(src); return u.hostname === 'player.vimeo.com' && /^\/video\/\d+/.test(u.pathname); } catch { return false; }
}
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
  /** Sequence: images shown together per step, laid out like a gallery (unless its images are joined one by one). */
  perFrame?: number;
  /** Web: show the page inside a Safari-like window. */
  frame?: 'browser';
  /** Space around the slide's content in px on the 1920 sheet: one value, or each side (text slides use their own margins). */
  margin?: number | Sides;
  /** Several images: how they share the sheet (see layoutPhotos). */
  layout?: Arrangement['layout'];
  /** Grid, sequence or web page: where captions line up under their images or page (left edge when unset). */
  captionAlign?: 'center' | 'right';
  /** Web: small text under the page or its window (see CAPTION), and its outlines like a photo's caption. */
  caption?: string;
  captionId?: string;
  fit?: Arrangement['fit'];
  gap?: number;
  /** Web: the browser window's toolbar color (light scheme, read when captured); tintDark is from older captures and unused. */
  tint?: string;
  tintDark?: string;
  end?: 'loop' | 'hold' | 'next';
  advance?: number;
  transition?: 'dissolve';
  /** YouTube, the exhibition video and a Vimeo player: the part that plays (clips and sequence videos keep it on their Photo). */
  from?: number;
  to?: number;
};
export const defaultTypography: Typography = { size: 64, leading: 100, paragraph: 100, tracking: -25, top: 96, left: 96, right: 96, composite: 'bold' };
/** Outer margin when a slide sets none: image sets and sequences keep 64, the Safari window 48, the rest bleed. */
export const defaultMargin = (s: Pick<Slide, 'kind' | 'frame'>) => s.kind === 'gallery' || s.kind === 'sequence' ? 64 : s.kind === 'web' && s.frame === 'browser' ? 48 : 0;
export type Sides = { top: number; right: number; bottom: number; left: number };
export const SIDES = [['top', '위'], ['bottom', '아래'], ['left', '왼쪽'], ['right', '오른쪽']] as const;
const all = (v: number): Sides => ({ top: v, right: v, bottom: v, left: v });
/** A slide's outer margin on each side, with the default for its kind when it sets none. */
export const marginOf = (s: Pick<Slide, 'kind' | 'frame' | 'margin'>): Sides => typeof s.margin === 'object' ? s.margin : all(s.margin ?? defaultMargin(s));
/** Stores sides as one number when they are equal, and nothing when that is the kind's default. */
export function storedMargin(s: Pick<Slide, 'kind' | 'frame'>, sides: Sides): Slide['margin'] {
  const { top, right, bottom, left } = sides;
  if (top !== right || top !== bottom || top !== left) return { top, right, bottom, left };
  return top === defaultMargin(s) ? undefined : top;
}
export const SEQUENCE_LIMIT = 200;
/** The most images 한 번에 (perFrame) groups; a step of joined images may hold up to GALLERY_LIMIT. */
export const PER_FRAME_LIMIT = 12;
/** Images laid out together on one sheet (an image set, or a sequence switched to 격자). */
export const GALLERY_LIMIT = 60;
// Published asset formats. Text slides publish as SVG outlines, clips as MP4/WebM.
export const assetTypes: Record<string, string> = Object.assign(Object.create(null), { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/svg+xml': 'svg', 'video/mp4': 'mp4', 'video/webm': 'webm' });
export const MAX_ASSET = 40 * 1024 * 1024;
export function assetIds(slides: Slide[]) {
  return [...new Set(slides.flatMap(s => [...(s.photos?.flatMap(p => [p.id, ...(p.poster ? [p.poster] : []), ...(p.captionId ? [p.captionId] : [])]) || []), ...(s.media ? [s.media.id] : []), ...(s.previewId ? [s.previewId] : []), ...(s.captionId ? [s.captionId] : [])]))];
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
// Copies slides (deck order) right after the last of them. A copy is the same slide under a new id;
// its images stay the same files, so editing or removing an image in one leaves the other intact.
export function duplicate(slides: Slide[], ids: string[], id = () => crypto.randomUUID()): { slides: Slide[]; copies: string[] } {
  const picked = new Set(ids), copies = slides.filter(s => picked.has(s.id)).map(s => ({ ...structuredClone(s), id: id() }));
  if (!copies.length) return { slides, copies: [] };
  const at = slides.findLastIndex(s => picked.has(s.id)) + 1;
  return { slides: [...slides.slice(0, at), ...copies, ...slides.slice(at)], copies: copies.map(s => s.id) };
}
/**
 * A sequence's steps, each laid out like a gallery: images joined to the one before them share its
 * step; a sequence without joined images shows `perFrame` at a time.
 */
export function sequenceSteps(photos: Photo[], perFrame = 1) {
  const joined = photos.some(p => p.joined), steps: Photo[][] = [];
  photos.forEach((p, i) => { if (i && (joined ? p.joined : i % perFrame)) steps.at(-1)!.push(p); else steps.push([p]); });
  return steps;
}
/**
 * Stores steps (empty ones dropped): as perFrame when all but the last hold the same number within its
 * limit and the last no more (the current perFrame first, so a short sequence keeps it), else as joined images.
 */
export function groupSteps(steps: Photo[][], perFrame = 1): Pick<Slide, 'photos' | 'perFrame'> {
  steps = steps.filter(step => step.length);
  const chunks = (size: number) => size <= PER_FRAME_LIMIT && steps.every((step, i) => i < steps.length - 1 ? step.length === size : step.length <= size);
  const size = chunks(perFrame) ? perFrame : steps.length && chunks(steps[0].length) ? steps[0].length : 0;
  return { perFrame: size > 1 ? size : undefined, photos: steps.flatMap(step => step.map(({ joined, ...p }, i) => size || !i ? p : { ...p, joined: true as const })) };
}
/** Joins the step this image starts to the step before it, or splits its step so it starts a new one. */
export function joinOrSplit(steps: Photo[][], id: string) {
  const k = steps.findIndex(step => step.some(p => p.id === id)), j = steps[k]?.findIndex(p => p.id === id);
  if (k < 0 || !k && !j) return steps;
  return j ? [...steps.slice(0, k), steps[k].slice(0, j), steps[k].slice(j), ...steps.slice(k + 1)]
    : [...steps.slice(0, k - 1), [...steps[k - 1], ...steps[k]], ...steps.slice(k + 1)];
}
/** How long a sequence step stays, in ms: the longest of its items, each its own duration, else a video's range (its length when unset), else the slide's interval. */
export const stepDuration = (step: Pick<Photo, 'duration' | 'video' | 'length' | 'from' | 'to'>[], interval = 400) =>
  Math.max(...step.map(p => p.duration !== undefined ? p.duration * 1000 : p.video && p.length ? Math.max(0.04, Math.min(p.to ?? p.length, p.length) - (p.from ?? 0)) * 1000 : interval));
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
  // A Vimeo page link (vimeo.com/<id>, an unlisted one with its hash) becomes its player.
  if (host === 'vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean), at = parts.findIndex(p => /^\d+$/.test(p));
    if (at >= 0) return { kind: 'web' as const, src: `https://player.vimeo.com/video/${parts[at]}${/^[\da-f]{6,}$/.test(parts[at + 1] || '') ? `?h=${parts[at + 1]}` : ''}` };
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
  // YouTube takes whole seconds; the range is widened to them.
  if (s.from) u.searchParams.set('start', String(Math.floor(s.from)));
  if (s.to !== undefined) u.searchParams.set('end', String(Math.ceil(s.to)));
  return u.href;
}
/** How several images share a sheet. Missing values keep the original image-set layout (equal cells). */
export type Arrangement = { layout?: 'rows' | 'columns' | 'cells'; fit?: 'contain' | 'cover'; gap?: number };
export const ARRANGEMENTS = [['rows', '높이 통일'], ['columns', '너비 통일'], ['cells', '칸']] as const;
export const DEFAULT_GAP = 24;
export type Box = { x: number; y: number; width: number; height: number };
/**
 * Lays images out inside the sheet (1920 × H) less a margin, with equal gaps between them.
 * - rows: one height for every image, rows in order; contain centres each row, cover stretches
 *   rows to the full width and height (cropping).
 * - columns: one width for every image, each image into the shortest column; contain centres each
 *   column, cover stretches columns to the full height and width.
 * - cells: equal cells; contain fits each image in its cell, cover fills the cell.
 * The number of rows, columns or cells is the one that shows the images largest (contain) or crops
 * them least (cover). below keeps that much room under every image for its caption (see captionRoom).
 */
export function layoutPhotos(photos: Pick<Photo, 'width' | 'height'>[], H = 1080, { layout = 'cells', fit = 'contain', gap = DEFAULT_GAP }: Arrangement = {}, margin: number | Sides = 64, below = 0): Box[] {
  const m = typeof margin === 'number' ? all(margin) : margin;
  const n = photos.length, W = 1920 - m.left - m.right, V = H - m.top - m.bottom;
  if (!n || W <= 0 || V <= 0) return [];
  const aspect = photos.map(p => p.width / p.height), cover = fit === 'cover';
  if (layout === 'rows' || layout === 'columns') {
    // Columns are rows of the transposed sheet: swap the axes, lay out rows, swap back. The room under
    // the images goes with each row in rows, and with each image along its column in columns.
    const across = layout === 'rows' ? W : V, along = layout === 'rows' ? V : W;
    const a = layout === 'rows' ? aspect : aspect.map(r => 1 / r);
    const perLine = layout === 'rows' ? below : 0, perItem = layout === 'rows' ? 0 : below;
    const lines = layout === 'rows' ? splitRows(a, across, along, gap, perLine) : packColumns(a, across, along, gap, perItem);
    const room = (line: number[]) => across - (line.length - 1) * gap - line.length * perItem;
    const most = (along - (lines.length - 1) * gap) / lines.length - perLine;
    const size = Math.min(...lines.map(line => room(line) / sum(line.map(i => a[i]))), most);
    const lineSize = cover ? most : size;
    const boxes: Box[] = [];
    let offset = (along - lines.length * (lineSize + perLine) - (lines.length - 1) * gap) / 2;
    for (const line of lines) {
      const natural = sum(line.map(i => a[i])) * size;
      const stretch = cover ? room(line) / natural : 1;
      let cursor = cover ? 0 : (room(line) - natural) / 2;
      for (const i of line) {
        const length = a[i] * size * stretch;
        boxes[i] = layout === 'rows'
          ? { x: m.left + cursor, y: m.top + offset, width: length, height: lineSize }
          : { x: m.left + offset, y: m.top + cursor, width: lineSize, height: length };
        cursor += length + perItem + gap;
      }
      offset += lineSize + perLine + gap;
    }
    return boxes;
  }
  let best: Box[] = [], score = -Infinity;
  for (let columns = 1; columns <= n; columns++) {
    // Each cell holds its image and the room under it, centred together.
    const rows = Math.ceil(n / columns), cw = (W - gap * (columns - 1)) / columns, ch = (V - gap * (rows - 1)) / rows, ih = ch - below;
    if (cw <= 0 || ih <= 0) continue;
    const boxes = aspect.map((ratio, i) => {
      const width = cover ? cw : Math.min(cw, ih * ratio), height = cover ? ih : width / ratio;
      const row = Math.floor(i / columns), count = Math.min(columns, n - row * columns);
      return { x: m.left + (W - count * cw - (count - 1) * gap) / 2 + (i % columns) * (cw + gap) + (cw - width) / 2, y: m.top + row * (ch + gap) + (ch - height - below) / 2, width, height };
    });
    const value = cover ? -sum(aspect.map(r => Math.abs(Math.log(cw / ih / r)))) : sum(boxes.map(b => b.width * b.height));
    if (value > score) { score = value; best = boxes; }
  }
  return best;
}
const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);
// Splits images in order into rows so that one shared height is as large as possible: for every row
// count, the split that keeps the widest row (aspect sum against its room) narrowest. Every row also
// keeps perLine under it.
function splitRows(a: number[], across: number, along: number, gap: number, perLine = 0) {
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
    const size = Math.min(1 / worst[k][n], (along - (k - 1) * gap) / k - perLine);
    if (size > bestSize) { bestSize = size; bestRows = k; }
  }
  const rows: number[][] = [];
  for (let k = bestRows, j = n; k > 0; k--) { const i = cut[k][j]; rows.unshift(Array.from({ length: j - i }, (_, t) => i + t)); j = i; }
  return rows;
}
// Puts each image into the currently shortest column; the column count is the one that gives the
// largest shared width. Every image also keeps perItem under it.
function packColumns(a: number[], across: number, along: number, gap: number, perItem = 0) {
  let best: number[][] = [[]], bestSize = 0;
  for (let c = 1; c <= a.length; c++) {
    const room = (along - (c - 1) * gap) / c;
    if (room <= 0) break;
    const columns: number[][] = Array.from({ length: c }, () => []), length = Array(c).fill(-gap);
    a.forEach((r, i) => { const j = length.indexOf(Math.min(...length)); columns[j].push(i); length[j] += room * r + perItem + gap; });
    const size = Math.min(room, ...columns.map(column => (across - (column.length - 1) * gap - column.length * perItem) / sum(column.map(i => a[i]))));
    if (size > bestSize) { bestSize = size; best = columns; }
  }
  return best;
}
/**
 * Captions are set in the portfolio's small type: its credit lines under the work, 18 px on 30 px
 * leading, tracking −40, in the regular composite. Lines break only where typed.
 */
export const CAPTION = { size: 18, leading: 30, tracking: -40, gap: 12, lines: 4 };
export const captionLines = (caption = '') => caption.split('\n').filter(line => line.trim()).length;
const validCaption = (caption: unknown) => typeof caption === 'string' && caption.length <= 500 && captionLines(caption) <= CAPTION.lines;
/** Room a grid or sequence keeps under every image when any of them has a caption: the gap and its most lines. */
export function captionRoom(photos: Pick<Photo, 'caption'>[] = []) {
  const lines = Math.max(0, ...photos.map(p => captionLines(p.caption)));
  return lines ? CAPTION.gap + CAPTION.size + (lines - 1) * CAPTION.leading : 0;
}
/**
 * A caption set like a text slide on the sheet: its first line's ink starts CAPTION.gap under the image
 * and lines up with the image's left edge, centre or right edge (text-align within these margins).
 */
export function captionTypography(box: Box, align?: Slide['captionAlign']): Typography {
  const centre = box.x + box.width / 2, half = Math.min(centre, 1920 - centre), end = box.x + box.width;
  const [left, right] = align === 'center' ? [centre - half, 1920 - centre - half] : align === 'right' ? [0, 1920 - end] : [box.x, 0];
  return { size: CAPTION.size, leading: CAPTION.leading, paragraph: 0, tracking: CAPTION.tracking, top: box.y + box.height + CAPTION.gap, left, right };
}
/** A web page's box (its window's, in a Safari frame): inside the slide's margin, less the room for its caption. */
export function pageBox(s: Pick<Slide, 'kind' | 'frame' | 'margin' | 'caption'>, H = 1080): Box {
  const m = marginOf(s);
  return { x: m.left, y: m.top, width: 1920 - m.left - m.right, height: H - m.top - m.bottom - captionRoom([s]) };
}
// A video item of a sequence or grid has its still and length; a clip's video may keep its length; an
// image has neither, nor a range.
const validPhoto = (p: Photo, clip = false) =>
  !!p &&
  typeof p.id === 'string' &&
  typeof p.name === 'string' &&
  Number.isFinite(p.width) &&
  p.width > 0 &&
  Number.isFinite(p.height) &&
  p.height > 0 &&
  (p.duration === undefined || within(p.duration, 0.04, 600)) &&
  (p.length === undefined || within(p.length, 0.04, 3600)) && validRange(p, p.length) && (p.joined === undefined || p.joined === true && !clip) &&
  (p.caption === undefined || !clip && validCaption(p.caption)) &&
  (p.captionId === undefined || typeof p.captionId === 'string' && p.caption !== undefined) &&
  (p.video === true ? typeof p.poster === 'string' && p.length !== undefined
    : p.video === undefined && p.poster === undefined && (clip || p.length === undefined && p.from === undefined && p.to === undefined));
const validRange = (r: Range, length?: number) =>
  (r.from === undefined || within(r.from, 0, 3600) && (length === undefined || r.from < length)) &&
  (r.to === undefined || within(r.to, 0.04, 3600)) &&
  (r.from === undefined || r.to === undefined || r.from < r.to);
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
        (s.margin !== undefined && !(typeof s.margin === 'object' && s.margin !== null && !Array.isArray(s.margin)
          ? Object.keys(s.margin).length === 4 && SIDES.every(([side]) => within((s.margin as Sides)[side], 0, 480))
          : within(s.margin, 0, 480))) ||
        ((s.layout !== undefined || s.fit !== undefined || s.gap !== undefined) && s.kind !== 'gallery' && s.kind !== 'sequence') ||
        (Array.isArray(s.photos) && s.photos.some((p: Photo) => p?.video || p?.caption !== undefined) && s.kind !== 'gallery' && s.kind !== 'sequence') ||
        (s.captionAlign !== undefined && (!['center', 'right'].includes(s.captionAlign) || !['gallery', 'sequence', 'web'].includes(s.kind))) ||
        (s.caption !== undefined && (s.kind !== 'web' || !validCaption(s.caption))) ||
        (s.captionId !== undefined && (typeof s.captionId !== 'string' || s.caption === undefined)) ||
        (s.layout !== undefined && !['rows', 'columns', 'cells'].includes(s.layout)) ||
        (s.fit !== undefined && !['contain', 'cover'].includes(s.fit)) ||
        (s.gap !== undefined && !within(s.gap, 0, 400)) ||
        ((s.from !== undefined || s.to !== undefined) && (!['web', 'youtube', 'video'].includes(s.kind) || !validRange(s)))
      )
        return false;
      if (s.kind === 'image')
        return /^\/slides\/page-(?:[0-6]\d|7[0-8])\.webp$/.test(s.src);
      if (s.kind === 'text')
        return typeof s.text === 'string' && s.text.length <= 10000 && validTypography(s.typo);
      if (s.kind === 'sequence')
        return Array.isArray(s.photos) && s.photos.length > 0 && s.photos.length <= SEQUENCE_LIMIT && s.photos.every((p: Photo) => validPhoto(p)) &&
          Number.isInteger(s.interval) && within(s.interval, 40, 10000) && ['loop', 'hold', 'next'].includes(s.end) &&
          (s.perFrame === undefined || Number.isInteger(s.perFrame) && within(s.perFrame, 1, PER_FRAME_LIMIT)) &&
          sequenceSteps(s.photos, s.perFrame).every(step => step.length <= GALLERY_LIMIT);
      if (s.kind === 'clip')
        return validPhoto(s.media, true) && ['loop', 'hold', 'next'].includes(s.end);
      if (s.kind === 'gallery' || s.kind === 'folio')
        return (
          (s.kind !== 'folio' || (s.photos?.length === 1 && /^#[0-9a-fA-F]{6}$/.test(s.folioPalette?.background || '') && /^#[0-9a-fA-F]{6}$/.test(s.folioPalette?.foreground || ''))) &&
          Array.isArray(s.photos) &&
          s.photos.length > 0 &&
          s.photos.length <= GALLERY_LIMIT &&
          s.photos.every((p: Photo) => validPhoto(p))
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
