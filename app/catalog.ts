export const BASE = '/presentations/';
export const LEGACY_SLUG = '2026-09-09-ahn-byunghak-graduation-project';
// Titles are in English like jaeyeonkim.kr; venue is where the talk was given.
export const presentations = [
  { slug: '2026-11-03-yoon-jaeyoung-graduation-project', shortSlug: '261103-yun', date: '2026.11.03', title: 'Talk at Prof. Yoon Jaeyoung’s Graduation Project Class', venue: 'HIVCD' },
  { slug: LEGACY_SLUG, shortSlug: '260909-ahn', date: '2026.09.09', title: 'Talk at Prof. Ahn Byunghak’s Graduation Project Class', venue: 'HIVCD' },
];
// Dates as each deck states it was presented (cover or first slide).
export const olderPresentations = [
  ['New Media Design 01', 'https://jaeyeonkim.kr/presentation-for-newmediadesign/index.html#1', '2022.10.14', 'HIVCD'],
  ['New Media Design 02', 'https://jaeyeonkim.kr/presentation/nmd02/index.html#1', '2022.10.28', 'HIVCD'],
  ['Physical Workshop and Design Studio (2)', 'https://jaeyeonkim.kr/presentation/mph01/index.html#1', '2022.11.03', 'HIVCD'],
  ['English for Art Major · Mid BEM art', 'https://jaeyeonkim.kr/presentation/eng01/index.html#1', '2022.11.07', 'HIVCD'],
  ['English for Art Major · Writing as Therapy', 'https://docs.google.com/presentation/d/1r25TtjRkMtNOQz7VPuf3iXk6AXaZijrb_6WHgjL9T-o/preview', '2022.12.12', 'HIVCD'],
];
export function localAsset(path: string) { return path.startsWith('/') && !path.startsWith(BASE) ? BASE + path.slice(1) : path; }
export function presentationUrl(slug: string, editing = false, shortSlug?: string) {
  const entry = presentations.find(p => p.slug === slug || p.shortSlug === slug);
  return `${BASE}${editing ? 'edit/' : ''}${shortSlug || entry?.shortSlug || slug}/`;
}
export const catalogEntries = [
  ...presentations.map(p => ({ id: p.slug, title: p.title, date: p.date, venue: p.venue, href: presentationUrl(p.slug), editHref: presentationUrl(p.slug, true) })),
  ...olderPresentations.map(([title, href, date, venue], i) => ({ id: `legacy-${i + 1}`, title, date, venue, href, editHref: '' })),
];
export type PresentationDetails = { title: string; date: string; slug: string; venue?: string };
export type CatalogItem = { id: string; public: boolean; presentation?: PresentationDetails };
export type CatalogConfig = { version: 1; items: CatalogItem[] };
export const draftKey = 'presentation-catalog-draft-v1';
export function validDeckId(value: unknown): value is string {
  return typeof value === 'string' && (presentations.some(p=>p.slug===value) || /^deck-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value));
}
const reserved = new Set(['edit','login','logout','auth','api','migrate','assets','slides','thumbnails','media','previews','decks','index','audio-morphology']);
export function validDetails(v: unknown): v is PresentationDetails {
  const d=v as PresentationDetails;
  if(!d || typeof d.title!=='string' || !d.title.trim() || d.title!==d.title.trim() || d.title.length>200 ||
    typeof d.slug!=='string' || d.slug.length>64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.slug) || reserved.has(d.slug) ||
    typeof d.date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) ||
    d.venue!==undefined && (typeof d.venue!=='string' || !d.venue.trim() || d.venue!==d.venue.trim() || d.venue.length>80))return false;
  const date=new Date(d.date+'T00:00:00Z');return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===d.date;
}
export function deckEntry(item: CatalogItem) {
  if(!validDeckId(item.id))return undefined;
  const original=presentations.find(p=>p.slug===item.id);
  const d=item.presentation;
  return d ? {slug:item.id,shortSlug:d.slug,title:d.title,date:d.date.replaceAll('-','.'),venue:d.venue||''} : original;
}
export function catalogEntry(item: CatalogItem) {
  const p=deckEntry(item);
  return p ? {id:item.id,title:p.title,date:p.date,venue:p.venue,href:presentationUrl(p.slug,false,p.shortSlug),editHref:presentationUrl(p.slug,true,p.shortSlug)} : catalogEntries.find(e=>e.id===item.id)!;
}
export function validCatalog(value: unknown): value is CatalogConfig {
  const v=value as CatalogConfig;
  if(!v || v.version!==1 || !Array.isArray(v.items) || v.items.length<catalogEntries.length || v.items.length>500 ||
    new Set(v.items.map(i=>i?.id)).size!==v.items.length || !catalogEntries.every(e=>v.items.some(i=>i?.id===e.id)))return false;
  if(!v.items.every(i=>i && typeof i.public==='boolean' &&
    (validDeckId(i.id) ? (i.presentation!==undefined ? validDetails(i.presentation) : presentations.some(p=>p.slug===i.id)) : catalogEntries.some(e=>e.id===i.id) && i.presentation===undefined)))return false;
  const used=new Set<string>();
  for(const i of v.items) {
    const p=deckEntry(i);if(!p)continue;
    const aliases=new Set([p.slug,p.shortSlug,...presentations.filter(b=>b.slug===i.id).map(b=>b.shortSlug)]);
    for(const alias of aliases){if(used.has(alias))return false;used.add(alias);}
  }
  return true;
}
export function mergeDraft(published: CatalogConfig, draft: CatalogConfig): CatalogConfig {
  // A saved order remains local; newly registered presentations from other tabs are retained.
  const merged:CatalogConfig={version:1,items:[...draft.items,...published.items.filter(p=>!draft.items.some(d=>d.id===p.id))]};
  return validCatalog(merged)?merged:published;
}
export function withLocalDraft(published: CatalogConfig): CatalogConfig {
  const saved=localStorage.getItem(draftKey);if(!saved)return published;
  const draft=JSON.parse(saved);if(!validCatalog(draft))throw Error('저장된 목록 형식을 확인하세요.');
  return mergeDraft(published,draft);
}
export async function readCatalog(): Promise<CatalogConfig> {
  const r = await fetch(`${BASE}decks/catalog.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw Error('발표 목록을 불러오지 못했습니다.');
  const value = await r.json();
  if (!validCatalog(value)) throw Error('발표 목록 형식을 확인하세요.');
  return value;
}
export function route(path: string, config?: CatalogConfig) {
  const parts = path.replace(/^\/presentations(?:\/|$)/, '/').split('/').filter(Boolean);
  const editing = parts[0] === 'edit';
  const slug = parts[editing ? 1 : 0];
  const validPath = parts.length === (editing ? 2 : 1);
  return { editing, entry: validPath ? (config ? config.items.map(deckEntry).filter((p): p is NonNullable<typeof p>=>!!p) : presentations).find(p => p.slug === slug || p.shortSlug === slug || presentations.some(b=>b.slug===p.slug && b.shortSlug===slug)) : undefined,
    index: !slug, migration: parts.length === 1 && parts[0] === 'migrate' };
}
