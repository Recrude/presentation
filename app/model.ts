import { chronologicalPages, projectForPage } from './chronology.ts';
export type Photo = { id: string; name: string; width: number; height: number };
// Text slide measurements are px on the 1920-wide sheet; tracking is 1/1000 em like InDesign.
// top and left are measured to the ink of the first line (see alignInk in text-slide.tsx).
// tabs are stops in px from the left margin; indent is a hanging indent: lines after a paragraph's
// first start there, and it is a tab stop too (InDesign: left indent with a negative first line).
export type Typography = { size: number; leading: number; paragraph: number; tracking: number; top: number; left: number; right: number; composite?: 'bold'; tabs?: number[]; indent?: number };
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
  /** Web: Safari's toolbar color for the page in the light and dark color schemes (read when captured). */
  tint?: string;
  tintDark?: string;
  end?: 'loop' | 'hold' | 'next';
  advance?: number;
  transition?: 'dissolve';
};
export const defaultTypography: Typography = { size: 48, leading: 80, paragraph: 80, tracking: -40, top: 96, left: 96, right: 96 };
export const SEQUENCE_LIMIT = 200;
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
// Try all grid shapes; maximize visible, uncropped image area. Center incomplete rows.
export function layoutPhotos(photos: Pick<Photo, 'width' | 'height'>[], H = 1080) {
  const W = 1920,
    padding = 64,
    gap = 24;
  if (!photos.length) return [];
  let best: { x: number; y: number; width: number; height: number }[] = [],
    score = -Infinity;
  for (let columns = 1; columns <= photos.length; columns++) {
    const rows = Math.ceil(photos.length / columns);
    const cw = (W - padding * 2 - gap * (columns - 1)) / columns;
    const ch = (H - padding * 2 - gap * (rows - 1)) / rows;
    if (cw <= 0 || ch <= 0) continue;
    const boxes = photos.map((photo, i) => {
      const ratio = photo.width / photo.height;
      const width = Math.min(cw, ch * ratio),
        height = width / ratio;
      const row = Math.floor(i / columns),
        count = Math.min(columns, photos.length - row * columns);
      return {
        x:
          (W - count * cw - (count - 1) * gap) / 2 +
          (i % columns) * (cw + gap) +
          (cw - width) / 2,
        y: padding + row * (ch + gap) + (ch - height) / 2,
        width,
        height,
      };
    });
    const area = boxes.reduce((sum, b) => sum + b.width * b.height, 0);
    if (area > score) {
      score = area;
      best = boxes;
    }
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
    (t.indent === undefined || within(t.indent, 0, 1800));
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
        [s.tint, s.tintDark].some(t => t !== undefined && (s.kind !== 'web' || typeof t !== 'string' || !/^#[0-9a-f]{6}$/.test(t)))
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
          s.photos.length <= 60 &&
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
