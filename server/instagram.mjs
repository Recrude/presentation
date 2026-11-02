// A post of the connected Instagram account through the official Instagram API with Instagram Login.
// The long-lived token (60 days) lives only in the server variable INSTAGRAM_ACCESS_TOKEN. The API can
// read the account's own media only, so a post is found among /me/media by its shortcode. Files come
// from Instagram's CDN in parts below Vercel's 4.5 MB response limit.
const GRAPH = 'https://graph.instagram.com/v26.0';
export const CHUNK = 4 * 1024 * 1024;
const MAX_ASSET = 40 * 1024 * 1024;
const TYPES = /^(image\/(jpeg|png|webp)|video\/mp4)$/;

export class InstagramError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}

export function postCode(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new InstagramError('인스타그램 게시물 주소를 확인하세요.', 400); }
  const m = u.pathname.match(/\/(?:p|reels?|tv)\/([A-Za-z0-9_-]{5,40})(?:\/|$)/);
  if (u.protocol !== 'https:' || !/^(www\.)?(instagram\.com|instagr\.am)$/.test(u.hostname) || !m) throw new InstagramError('인스타그램 게시물 주소를 확인하세요.', 400);
  return m[1];
}
export const isInstagramPost = raw => { try { postCode(raw); return true; } catch { return false; } };

// Files are fetched only from Instagram's CDN, by https, without following redirects.
export function assetUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new InstagramError('인스타그램 파일 주소가 아닙니다.', 400); }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !/(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname))
    throw new InstagramError('인스타그램 파일 주소가 아닙니다.', 400);
  return u;
}

async function graph(url, token, fetchImpl) {
  const u = new URL(url);
  if (u.origin !== 'https://graph.instagram.com') throw new InstagramError('인스타그램 API 주소가 아닙니다.', 502);
  u.searchParams.set('access_token', token);
  const r = await fetchImpl(u, { signal: AbortSignal.timeout(15000) });
  const body = await r.json().catch(() => ({}));
  if (r.ok && !body.error) return body;
  const code = body.error?.code;
  if (code === 190) throw new InstagramError('인스타그램 토큰이 만료됐거나 맞지 않습니다. Meta 개발자 대시보드에서 토큰을 다시 생성해 Vercel의 INSTAGRAM_ACCESS_TOKEN에 넣어 주세요.', 502);
  if ([4, 17, 32, 613].includes(code)) throw new InstagramError('인스타그램 API 호출 한도에 걸렸습니다. 잠시 뒤 다시 시도하세요.', 429);
  throw new InstagramError(`인스타그램 API 오류${body.error?.message ? ` · ${body.error.message}` : ''}`, 502);
}

// The caption's first line, cut at a word to at most 40 characters.
export function captionTitle(caption = '') {
  const line = caption.split('\n').map(s => s.trim()).find(Boolean) || '';
  if (line.length <= 40) return line;
  const cut = line.slice(0, 40), space = cut.lastIndexOf(' ');
  return (space > 10 ? cut.slice(0, space) : cut).replace(/[\s,.·:;(@#-]+$/, '') + '…';
}
// A video whose audio is licensed comes without media_url; its cover frame comes in as a still.
const asset = m => m.media_type === 'VIDEO'
  ? (m.media_url ? { type: 'video', url: m.media_url } : m.thumbnail_url ? { type: 'image', url: m.thumbnail_url, still: true } : null)
  : m.media_url ? { type: 'image', url: m.media_url } : null;

export async function instagramPost(raw, { token = process.env.INSTAGRAM_ACCESS_TOKEN, fetchImpl = fetch, pages = 40 } = {}) {
  const code = postCode(raw);
  if (!token) throw new InstagramError('인스타그램 토큰이 설정되지 않았습니다(INSTAGRAM_ACCESS_TOKEN).', 503);
  const fields = 'id,shortcode,media_type,media_url,thumbnail_url,caption';
  let page = await graph(`${GRAPH}/me/media?fields=${fields}&limit=100`, token, fetchImpl);
  for (let n = 1; ; n++) {
    const post = page.data?.find(m => m.shortcode === code);
    if (post) {
      const parts = post.media_type === 'CAROUSEL_ALBUM'
        ? (await graph(`${GRAPH}/${post.id}/children?fields=id,media_type,media_url,thumbnail_url`, token, fetchImpl)).data || []
        : [post];
      const items = parts.map(asset).filter(Boolean);
      if (!items.length) throw new InstagramError('이 게시물에서 가져올 수 있는 파일이 없습니다.', 422);
      return { code, title: captionTitle(post.caption) || code, items };
    }
    if (!page.paging?.next || n >= pages) throw new InstagramError('연결된 인스타그램 계정의 게시물에서 찾지 못했습니다. 연결된 계정의 게시물만 가져올 수 있습니다.', 404);
    page = await graph(page.paging.next, token, fetchImpl);
  }
}

// One part (CHUNK bytes from part × CHUNK) of a file, with the file's total size.
export async function instagramAsset(raw, part, { fetchImpl = fetch } = {}) {
  const u = assetUrl(raw);
  if (!Number.isInteger(part) || part < 0 || part * CHUNK >= MAX_ASSET) throw new InstagramError('파일 조각 번호를 확인하세요.', 400);
  const start = part * CHUNK;
  const r = await fetchImpl(u, { headers: { Range: `bytes=${start}-${start + CHUNK - 1}` }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new InstagramError('인스타그램 파일을 받지 못했습니다. 파일 주소가 만료됐을 수 있으니 다시 가져오세요.', 502);
  const type = (r.headers.get('content-type') || '').split(';')[0].trim();
  if (!TYPES.test(type)) throw new InstagramError('JPG·PNG·WEBP 이미지나 MP4 영상만 가져올 수 있습니다.', 415);
  let bytes = Buffer.from(await r.arrayBuffer()), total;
  if (r.status === 206) total = Number(r.headers.get('content-range')?.split('/')[1]);
  else { total = bytes.length; bytes = bytes.subarray(start, start + CHUNK); }
  if (!Number.isInteger(total) || total <= 0) throw new InstagramError('인스타그램 파일 크기를 알 수 없습니다.', 502);
  if (total > MAX_ASSET) throw new InstagramError('40MB가 넘는 파일은 가져올 수 없습니다.', 413);
  return { bytes, type, total };
}

export async function instagramHandler(query, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (query.has('instagram-asset')) {
      const { bytes, type, total } = await instagramAsset(query.get('instagram-asset'), Number(query.get('part') || 0));
      res.statusCode = 200; res.setHeader('Content-Type', type); res.setHeader('X-Asset-Size', String(total)); res.end(bytes);
    } else {
      const post = await instagramPost(query.get('instagram'));
      res.statusCode = 200; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(post));
    }
  } catch (e) {
    res.statusCode = e instanceof InstagramError ? e.status : 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(e instanceof InstagramError ? e.message : '인스타그램에서 가져오지 못했습니다.');
  }
}
