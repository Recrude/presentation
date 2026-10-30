import { BASE, presentations } from './catalog';
import { assetIds, type Snapshot } from './published';
import { type Slide, validDeck } from './model';
export const repository = 'Recrude/presentation';
export const localPublishing = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(location.hostname);
export async function publishDeck(slug: string, slides: Slide[], assets: Record<string, string>, token: string, progress: (s: string) => void) {
  if (!presentations.some(p => p.slug === slug) || !validDeck(slides)) throw Error('발표 형식을 확인하세요.');
  if (!localPublishing && !token.trim()) throw Error('GitHub 토큰을 입력하세요.');
  async function api(path: string, method = 'GET', body?: unknown) {
    const r = await fetch(localPublishing ? `${BASE}api/github` : `https://api.github.com/repos/${repository}/${path}`, {
      method: localPublishing ? 'POST' : method,
      headers: localPublishing ? { 'Content-Type': 'application/json', 'X-Local-Publish': '1' } : {
        Accept: 'application/vnd.github+json', Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28',
      },
      body: localPublishing ? JSON.stringify({ path, method, body }) : body === undefined ? undefined : JSON.stringify(body),
    });
    if (!r.ok) throw Error(r.status === 401 || r.status === 403 ? 'GitHub 저장소 Contents 쓰기 권한을 확인하세요.' : r.status === 422 || r.status === 409 ? '다른 게시가 먼저 반영되었습니다. 다시 게시하세요.' : `GitHub 요청 실패 (${r.status}) · 편집 내용은 유지됩니다.`);
    return r.json();
  }
  progress('게시 준비 중');
  const ref = await api('git/ref/heads/main');
  const parent = ref.object.sha;
  const commit = await api(`git/commits/${parent}`);
  const tree: {path: string; mode: string; type: string; sha?: string; content?: string}[] = [];
  const snapshot: Snapshot = {version: 1, slug, slides: slides.filter(s => !s.hidden), assets: {}, publishedAt: new Date().toISOString()};
  const ids = assetIds(snapshot.slides), paths = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i], source = assets[id];
    if (!source) throw Error('누락된 이미지가 있습니다. 다시 추가한 뒤 게시하세요.');
    if (source.startsWith(`${BASE}decks/`) && /^\/presentations\/decks\/[a-z0-9-]+\/assets\/[a-f0-9]+\.(png|jpg|webp|gif|avif)$/.test(source)) {
      snapshot.assets[id] = source; continue;
    }
    progress(`이미지 게시 ${i + 1}/${ids.length}`);
    const r = await fetch(source); if (!r.ok) throw Error('이미지 파일을 읽지 못했습니다.');
    const blob = await r.blob();
    const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'avif'} as Record<string,string>)[blob.type];
    if (!ext || blob.size > 40 * 1024 * 1024) throw Error('40MB 이하의 이미지 파일만 게시할 수 있습니다.');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
    const path = `public/decks/${slug}/assets/${hash}.${ext}`;
    snapshot.assets[id] = `${BASE}${path.slice(7)}`;
    if (paths.has(path)) continue;
    paths.add(path);
    let binary = ''; for (let j = 0; j < bytes.length; j += 8192) binary += String.fromCharCode(...bytes.subarray(j, j + 8192));
    const result = await api('git/blobs', 'POST', {content:btoa(binary), encoding:'base64'});
    tree.push({path,mode:'100644',type:'blob',sha:result.sha});
  }
  tree.push({path:`public/decks/${slug}/deck.json`,mode:'100644',type:'blob',content:JSON.stringify(snapshot,null,2)+'\n'});
  progress('GitHub에 게시 중');
  const nextTree = await api('git/trees','POST',{base_tree:commit.tree.sha,tree});
  const next = await api('git/commits','POST',{message:`Publish ${slug}`,tree:nextTree.sha,parents:[parent]});
  // Non-force update makes concurrent publishes fail safely instead of overwriting work.
  await api('git/refs/heads/main','PATCH',{sha:next.sha,force:false});
  return snapshot;
}
