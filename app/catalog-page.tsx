import { useEffect, useState } from 'react';
import { BASE, catalogEntries, readCatalog, validCatalog, type CatalogItem } from './catalog';
import { localPublishing, publishCatalog } from './github-publish';
const draftKey = 'presentation-catalog-draft-v1';
export function CatalogPage({ editing }: { editing: boolean }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [ready, setReady] = useState(false), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('불러오는 중');
  const [token, setToken] = useState(''), [publishing, setPublishing] = useState(false);
  const [drag, setDrag] = useState<string | null>(null), [over, setOver] = useState<{id: string; after: boolean} | null>(null);
  useEffect(() => {
    document.body.classList.add('catalog-page'); document.title = editing ? '발표 관리 · Jaeyeon Kim' : 'Presentations · Jaeyeon Kim';
    let cancelled = false;
    void (async () => {
      try {
        let config = await readCatalog();
        if (editing) {
          const saved = localStorage.getItem(draftKey);
          if (saved) { const draft = JSON.parse(saved); if (!validCatalog(draft)) throw Error('저장된 목록 형식을 확인하세요.'); config = draft; }
        }
        if (!cancelled) { setItems(config.items); setReady(true); setStatus(''); }
      } catch(e) { if (!cancelled) setStatus(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'); }
    })();
    return () => { cancelled = true; document.body.classList.remove('catalog-page'); };
  }, [editing]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  function change(next: CatalogItem[]) { setItems(next); setDirty(true); setStatus('저장되지 않음'); }
  function move(id: string, slot: number) {
    const from = items.findIndex(i => i.id === id);
    if (from < 0 || slot < 0 || slot > items.length) return;
    const next = [...items]; const [item] = next.splice(from,1); next.splice(slot > from ? slot - 1 : slot,0,item);
    if (next.some((item,i) => item !== items[i])) change(next);
  }
  function save() {
    try { localStorage.setItem(draftKey, JSON.stringify({version:1,items})); setDirty(false); setStatus('이 브라우저에 저장됨'); return true; }
    catch { setStatus('브라우저 저장 공간을 확인하세요.'); return false; }
  }
  async function publish() {
    if (!save()) return;
    setBusy(true); setStatus('GitHub에 게시 중');
    try { await publishCatalog({version:1,items},token); setPublishing(false); setStatus('게시됨 · 배포 완료 후 공개 목록에 반영됩니다'); }
    catch(e) { setStatus(e instanceof Error ? e.message : '게시하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <main className="catalog">
    <header className="catalog-header"><a href="https://jaeyeonkim.kr/">Jaeyeon Kim</a>
      {editing && <nav aria-label="발표 목록 설정"><a href={BASE} target="_blank" rel="noreferrer">공개 목록 ↗</a><button disabled={!ready || busy} onClick={save}>저장{dirty ? ' *' : ''}</button><button disabled={!ready || busy} onClick={() => setPublishing(v => !v)}>게시</button></nav>}
    </header>
    {publishing && <section className="catalog-publish" aria-label="목록 게시">
      {!localPublishing && <><input type="password" autoComplete="off" aria-label="GitHub 토큰" placeholder="GitHub 토큰" value={token} onChange={e => setToken(e.target.value)}/><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">토큰 만들기 ↗</a></>}
      <button disabled={busy || (!localPublishing && !token.trim())} onClick={publish}>공개 목록에 반영</button>
      {!localPublishing && token && <button disabled={busy} onClick={() => setToken('')}>연결 해제</button>}
    </section>}
    {status && <p className="catalog-status" role="status">{status}</p>}
    {!ready && status !== '불러오는 중' && <button onClick={() => location.reload()}>다시 불러오기</button>}
    <ol className={`presentation-list${editing ? ' managing' : ''}`} aria-label={editing ? '발표 순서와 공개 설정' : '발표 목록'}>
      {items.filter(i => editing || i.public).map(item => {
        const entry = catalogEntries.find(e => e.id === item.id)!;
        const index = items.indexOf(item);
        return <li key={item.id} data-presentation-id={item.id} className={`catalog-row${!item.public ? ' is-private' : ''}${over?.id === item.id ? over.after ? ' drop-after' : ' drop-before' : ''}`}
          onDragOver={e => { if (!editing || !drag || busy) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const rect = e.currentTarget.getBoundingClientRect(); setOver({id:item.id,after:e.clientY > rect.top + rect.height/2}); }}
          onDrop={e => {e.preventDefault(); if (drag && over && !busy) move(drag,index + (over.after ? 1 : 0)); setDrag(null); setOver(null);}}>
          {editing && <button className="catalog-handle" draggable={!busy} disabled={busy} aria-label={`${entry.title} 순서 끌기`} onDragStart={e => {setDrag(item.id);e.dataTransfer.setData('text/plain',item.id);e.dataTransfer.effectAllowed='move';}} onDragEnd={() => {setDrag(null);setOver(null);}}>↕</button>}
          <a className="catalog-entry" href={editing && entry.editHref ? entry.editHref : entry.href}>
            {entry.date && <time>{entry.date}</time>}<span>{entry.title}</span>
          </a>
          {editing && <div className="catalog-actions">
            <button disabled={busy} aria-pressed={item.public} aria-label={`${entry.title} 공개 여부`} onClick={() => change(items.map(i => i.id === item.id ? {...i,public:!i.public} : i))}>{item.public ? '공개' : '비공개'}</button>
            <button disabled={busy || index===0} aria-label={`${entry.title} 위로`} onClick={() => move(item.id,index-1)}>↑</button>
            <button disabled={busy || index===items.length-1} aria-label={`${entry.title} 아래로`} onClick={() => move(item.id,index+2)}>↓</button>
          </div>}
        </li>;
      })}
    </ol>
    {editing && <p className="catalog-note">저장은 이 브라우저에, 게시는 공개 목록에 반영됩니다.<br/>비공개는 목록과 새 발표 화면에서 숨김. 원본 파일·외부 링크의 접근 권한은 유지됩니다.</p>}
  </main>;
}
