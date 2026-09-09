import { chronologicalPages, projectForPage } from './chronology.ts';
export type Photo = { id: string; name: string; width: number; height: number };
export type Slide = {
  id: string;
  title: string;
  kind: 'image' | 'web' | 'youtube' | 'gallery' | 'folio' | 'video';
  src: string;
  hidden: boolean;
  photos?: Photo[];
  previewId?: string;
  folioPalette?: { background: string; foreground: string };
  autoplay?: boolean;
  controls?: boolean;
  muted?: boolean;
};
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
export function layoutPhotos(photos: Pick<Photo, 'width' | 'height'>[]) {
  const W = 1920,
    H = 1080,
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
        typeof s.src !== 'string'
      )
        return false;
      if (s.kind === 'image')
        return /^\/slides\/page-(?:[0-6]\d|7[0-8])\.webp$/.test(s.src);
      if (s.kind === 'gallery' || s.kind === 'folio')
        return (
          (s.kind !== 'folio' || (s.photos?.length === 1 && /^#[0-9a-fA-F]{6}$/.test(s.folioPalette?.background || '') && /^#[0-9a-fA-F]{6}$/.test(s.folioPalette?.foreground || ''))) &&
          Array.isArray(s.photos) &&
          s.photos.length > 0 &&
          s.photos.length <= 60 &&
          s.photos.every(
            (p: Photo) =>
              p &&
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              Number.isFinite(p.width) &&
              p.width > 0 &&
              Number.isFinite(p.height) &&
              p.height > 0,
          )
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
