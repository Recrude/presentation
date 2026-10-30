import { useEffect, useState } from 'react';
import Home from './page';
import { BASE, presentationUrl, readCatalog, route } from './catalog';
import { MigrationPage } from './transfer';
import { CatalogPage } from './catalog-page';
export default function Router() {
  const { editing, entry, index, migration } = route(location.pathname);
  useEffect(() => {
    if (!entry) return;
    const canonical = presentationUrl(entry.slug, editing);
    if (location.pathname !== canonical) history.replaceState(null,'',canonical + location.search + location.hash);
  },[entry,editing]);
  if (migration) return <MigrationPage/>;
  if (entry) return editing ? <Home key={entry.slug} entry={entry}/> : <PublicPresentation entry={entry}/>;
  if (index) return <CatalogPage editing={editing}/>;
  return <main className="public-empty"><p>발표를 찾을 수 없습니다.</p><a href={BASE}>목록</a></main>;
}
function PublicPresentation({entry}: {entry: NonNullable<ReturnType<typeof route>['entry']>}) {
  const [allowed,setAllowed] = useState(false), [message,setMessage] = useState('불러오는 중');
  useEffect(() => {
    let cancelled = false;
    void readCatalog().then(config => {
      if (cancelled) return;
      if (config.items.find(i => i.id === entry.slug)?.public) setAllowed(true);
      else setMessage('공개되지 않은 발표입니다.');
    }).catch(() => {if (!cancelled) setMessage('발표를 불러오지 못했습니다. 다시 시도하세요.');});
    return () => {cancelled=true;};
  }, [entry.slug]);
  return allowed ? <Home entry={entry} publicView/> : <main className="public-empty"><p>{message}</p><a href={BASE}>목록</a></main>;
}
