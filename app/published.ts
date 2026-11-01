import { BASE } from './catalog';
import { assetIds, isFormat, validDeck, type Format, type Slide } from './model';
export { assetIds };
export type Snapshot = { version: 1; slug: string; format?: Format; slides: Slide[]; assets: Record<string, string>; publishedAt: string };
export function validSnapshot(value: unknown, slug: string): value is Snapshot {
  const s = value as Snapshot;
  return !!s && s.version === 1 && s.slug === slug && (s.format === undefined || isFormat(s.format)) && validDeck(s.slides) && !!s.assets && typeof s.assets === 'object' &&
    assetIds(s.slides).every(id => typeof s.assets[id] === 'string' && /^\/presentations\/decks\/[a-z0-9-]+\/assets\/[a-f0-9]+\.(png|jpg|webp|gif|avif|svg|mp4|webm)$/.test(s.assets[id]));
}
export async function readPublished(slug: string): Promise<Snapshot | null> {
  const r = await fetch(`${BASE}decks/${slug}/deck.json`, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
  if (r.status === 404) return null;
  if (!r.ok) throw Error('공개본을 불러오지 못했습니다.');
  const value: unknown = await r.json();
  if (!validSnapshot(value, slug)) throw Error('공개본 형식을 확인하세요.');
  return value;
}
