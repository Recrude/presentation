export const BASE = '/presentations/';
export const LEGACY_SLUG = '2026-09-09-ahn-byunghak-graduation-project';
export const presentations = [
  { slug: '2026-11-03-yoon-jaeyoung-graduation-project', shortSlug: '261103-yun', date: '2026.11.03', title: '윤재영 교수님 졸업프로젝트 발표' },
  { slug: LEGACY_SLUG, shortSlug: '260909-ahn', date: '2026.09.09', title: '안병학 교수님 졸업프로젝트 발표' },
];
export const olderPresentations = [
  ['New Media Design 01', 'https://jaeyeonkim.kr/presentation-for-newmediadesign/index.html#1'],
  ['New Media Design 02', 'https://jaeyeonkim.kr/presentation/nmd02/index.html#1'],
  ['Physical Workshop and Design Studio (2)', 'https://jaeyeonkim.kr/presentation/mph01/index.html#1'],
  ['English for Art Major · Mid BEM art', 'https://jaeyeonkim.kr/presentation/eng01/index.html#1'],
  ['English for Art Major · Writing as Therapy', 'https://docs.google.com/presentation/d/1r25TtjRkMtNOQz7VPuf3iXk6AXaZijrb_6WHgjL9T-o/preview'],
];
export function localAsset(path: string) { return path.startsWith('/') && !path.startsWith(BASE) ? BASE + path.slice(1) : path; }
export function presentationUrl(slug: string, editing = false) {
  const entry = presentations.find(p => p.slug === slug || p.shortSlug === slug);
  return `${BASE}${editing ? 'edit/' : ''}${entry?.shortSlug || slug}/`;
}
export const catalogEntries = [
  ...presentations.map(p => ({ id: p.slug, title: p.title, date: p.date, href: presentationUrl(p.slug), editHref: presentationUrl(p.slug, true) })),
  ...olderPresentations.map(([title, href], i) => ({ id: `legacy-${i + 1}`, title, date: '', href, editHref: '' })),
];
export type CatalogItem = { id: string; public: boolean };
export type CatalogConfig = { version: 1; items: CatalogItem[] };
export function validCatalog(value: unknown): value is CatalogConfig {
  const v = value as CatalogConfig;
  return !!v && v.version === 1 && Array.isArray(v.items) && v.items.length === catalogEntries.length &&
    new Set(v.items.map(i => i?.id)).size === catalogEntries.length &&
    v.items.every(i => i && typeof i.public === 'boolean' && catalogEntries.some(e => e.id === i.id));
}
export async function readCatalog(): Promise<CatalogConfig> {
  const r = await fetch(`${BASE}decks/catalog.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error('발표 목록을 불러오지 못했습니다.');
  const value = await r.json();
  if (!validCatalog(value)) throw Error('발표 목록 형식을 확인하세요.');
  return value;
}
export function route(path: string) {
  const parts = path.replace(/^\/presentations(?:\/|$)/, '/').split('/').filter(Boolean);
  const editing = parts[0] === 'edit';
  const slug = parts[editing ? 1 : 0];
  const validPath = parts.length === (editing ? 2 : 1);
  return { editing, entry: validPath ? presentations.find(p => p.slug === slug || p.shortSlug === slug) : undefined,
    index: !slug, migration: parts.length === 1 && parts[0] === 'migrate' };
}
