export const BASE = '/presentations/';
export const LEGACY_SLUG = '2026-09-09-ahn-byunghak-graduation-project';
export const presentations = [
  { slug: '2026-11-03-yoon-jaeyoung-graduation-project', date: '2026.11.03', title: '윤재영 교수님 졸업프로젝트 발표' },
  { slug: LEGACY_SLUG, date: '2026.09.09', title: '안병학 교수님 졸업프로젝트 발표' },
];
export const olderPresentations = [
  ['New Media Design 01', 'https://jaeyeonkim.kr/presentation-for-newmediadesign/index.html#1'],
  ['New Media Design 02', 'https://jaeyeonkim.kr/presentation/nmd02/index.html#1'],
  ['Physical Workshop and Design Studio (2)', 'https://jaeyeonkim.kr/presentation/mph01/index.html#1'],
  ['English for Art Major · Mid BEM art', 'https://jaeyeonkim.kr/presentation/eng01/index.html#1'],
  ['English for Art Major · Writing as Therapy', 'https://docs.google.com/presentation/d/1r25TtjRkMtNOQz7VPuf3iXk6AXaZijrb_6WHgjL9T-o/preview'],
];
export function localAsset(path: string) { return path.startsWith('/') && !path.startsWith(BASE) ? BASE + path.slice(1) : path; }
export function route(path: string) {
  const parts = path.replace(/^\/presentations(?:\/|$)/, '/').split('/').filter(Boolean);
  const editing = parts[0] === 'edit';
  const slug = parts[editing ? 1 : 0];
  return { editing, entry: presentations.find(p => p.slug === slug), index: !slug, migration: parts[0] === 'migrate' };
}
