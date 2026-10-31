import { useEffect, useState } from 'react';
import { BASE, catalogEntry, deckEntry, draftKey, readCatalog, validCatalog, withLocalDraft, mergeDraft, type CatalogItem, type PresentationDetails } from './catalog';
import { publishCatalog, createPresentation } from './github-publish';
export function CatalogPage({ editing }: { editing: boolean }) {
  const [form,setForm]=useState<{id:string|null;details:PresentationDetails}|null>(null);
  const [formError,setFormError]=useState('');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [ready, setReady] = useState(false), [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('불러오는 중');
  const [drag, setDrag] = useState<string | null>(null), [over, setOver] = useState<{id: string; after: boolean} | null>(null);
  useEffect(() => {
    document.body.classList.add('catalog-page'); document.title = editing ? '발표 관리 · Jaeyeon Kim' : 'Presentations · Jaeyeon Kim';
    let cancelled = false;
    void (async () => {
      try {
        let config = await readCatalog();
        if (editing) config=withLocalDraft(config);
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
    setBusy(true); setStatus('게시 중');
    try { const result=await publishCatalog({version:1,items}); setStatus(result.unchanged?'공개 목록과 같습니다':'게시됨 · 배포 완료 후 공개 목록에 반영됩니다'); }
    catch(e) { setStatus(e instanceof Error ? e.message : '게시하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  function openDetails(item?:CatalogItem) {
    const p=item?deckEntry(item):undefined;
    const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    setForm({id:item?.id||null,details:{title:p?.title||'',date:p?.date.replaceAll('.','-')||today,slug:p?.shortSlug||''}});setFormError('');
  }
  async function submitDetails(e:React.FormEvent) {
    e.preventDefault();if(!form || busy)return;
    const id=form.id||`deck-${crypto.randomUUID()}`;
    const details={...form.details,title:form.details.title.trim(),slug:form.details.slug.trim().toLowerCase()};
    const item:CatalogItem={id,public:form.id?items.find(i=>i.id===id)!.public:false,presentation:details};
    const next=form.id?items.map(i=>i.id===id?item:i):[item,...items];
    if(!validCatalog({version:1,items:next})){setFormError('제목·날짜를 확인하세요. 슬러그는 중복되지 않는 영문 소문자·숫자·하이픈으로 입력하세요.');return;}
    if(form.id){change(next);setForm(null);return;}
    setBusy(true);setFormError('');
    try {
      const result=await createPresentation(item);
      const config=mergeDraft(result.config,{version:1,items:next});
      setItems(config.items);setForm(null);
      try{localStorage.setItem(draftKey,JSON.stringify(config));setDirty(false);setStatus('추가됨 · 제목을 누르면 장표를 편집합니다');}
      catch{setDirty(true);setStatus('추가됨 · 브라우저 저장 공간을 확인하세요');}
    }catch(e){setFormError(e instanceof Error?e.message:'발표를 추가하지 못했습니다.');}
    finally{setBusy(false);}
  }
  return <main className="catalog">
    <header className="catalog-header"><a href="https://jaeyeonkim.kr/">Jaeyeon Kim</a>
      {editing && <nav aria-label="발표 목록 설정"><a href={BASE} target="_blank" rel="noreferrer">공개 목록 ↗</a><button disabled={!ready || busy || !!form} onClick={()=>openDetails()}>새 발표</button><button disabled={!ready || busy || !!form} onClick={save}>저장{dirty ? ' *' : ''}</button><button disabled={!ready || busy || !!form} onClick={publish}>게시</button>{!import.meta.env.DEV && <form method="post" action={`${BASE}logout/`}><button type="submit">로그아웃</button></form>}</nav>}
    </header>
    {form && <form className="catalog-details" onSubmit={submitDetails}>
      <label>제목<input name="title" value={form.details.title} required maxLength={200} autoFocus disabled={busy} onChange={e=>setForm({...form,details:{...form.details,title:e.target.value}})}/></label>
      <label>날짜<input name="date" type="date" value={form.details.date} required disabled={busy} onChange={e=>setForm({...form,details:{...form.details,date:e.target.value}})}/></label>
      <label>슬러그<input name="slug" value={form.details.slug} required maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" autoCapitalize="none" spellCheck={false} disabled={busy} onChange={e=>setForm({...form,details:{...form.details,slug:e.target.value.toLowerCase()}})}/></label>
      <p className="catalog-address">jaeyeonkim.kr/presentations/{form.details.slug || 'slug'}/</p>
      {formError && <p role="alert">{formError}</p>}
      <div><button disabled={busy} type="submit">{busy?'추가 중':form.id?'적용':'추가'}</button><button disabled={busy} type="button" onClick={()=>setForm(null)}>취소</button></div>
      {!form.id && <p className="catalog-note">새 발표는 비공개로 추가됩니다.</p>}
    </form>}
    {status && <p className="catalog-status" role="status">{status}</p>}
    {!ready && status !== '불러오는 중' && <button onClick={() => location.reload()}>다시 불러오기</button>}
    <ol className={`presentation-list${editing ? ' managing' : ''}`} aria-label={editing ? '발표 순서와 공개 설정' : '발표 목록'}>
      {items.filter(i => editing || i.public).map(item => {
        const entry = catalogEntry(item);
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
            {entry.editHref && <button disabled={busy || !!form} onClick={()=>openDetails(item)}>설정</button>}
            <button disabled={busy || index===0} aria-label={`${entry.title} 위로`} onClick={() => move(item.id,index-1)}>↑</button>
            <button disabled={busy || index===items.length-1} aria-label={`${entry.title} 아래로`} onClick={() => move(item.id,index+2)}>↓</button>
          </div>}
        </li>;
      })}
    </ol>
    {editing && <p className="catalog-note">저장은 이 브라우저에, 게시는 공개 목록에 반영됩니다.<br/>비공개는 목록과 새 발표 화면에서 숨김. 원본 파일·외부 링크의 접근 권한은 유지됩니다.</p>}
  </main>;
}
