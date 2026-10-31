import { useEffect, useState } from 'react';
import Home from './page';
import { BASE, presentationUrl, readCatalog, route, withLocalDraft, type CatalogConfig } from './catalog';
import { MigrationPage } from './transfer';
import { CatalogPage } from './catalog-page';
export default function Router() {
  const initial=route(location.pathname);
  const [config,setConfig]=useState<CatalogConfig|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(initial.index || initial.migration)return;
    let cancelled=false;
    void readCatalog().then(c=>{if(!cancelled)setConfig(initial.editing?withLocalDraft(c):c);}).catch(()=>{if(!cancelled)setError('발표를 불러오지 못했습니다. 다시 시도하세요.');});
    return ()=>{cancelled=true;};
  },[]);
  const {editing,entry,index,migration}=route(location.pathname,config||undefined);
  useEffect(()=>{
    if(!entry || !config)return;
    const canonical=presentationUrl(entry.slug,editing,entry.shortSlug);
    if(location.pathname!==canonical)history.replaceState(null,'',canonical+location.search+location.hash);
  },[entry?.slug,entry?.shortSlug,editing,config]);
  if(migration)return <MigrationPage/>;
  if(index)return <CatalogPage editing={editing}/>;
  const message=error || (!config?'불러오는 중':!entry?'발표를 찾을 수 없습니다.':!editing && !config.items.find(i=>i.id===entry.slug)?.public?'공개되지 않은 발표입니다.':'');
  if(message)return <main className="public-empty"><p>{message}</p><a href={BASE}>목록</a></main>;
  return <Home key={entry!.slug} entry={entry!} publicView={!editing}/>;
}
