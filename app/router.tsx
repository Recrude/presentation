import Home from './page';
import { BASE, presentations, olderPresentations, route } from './catalog';
import { MigrationPage } from './transfer';
export default function Router() {
  const { editing, entry, index, migration } = route(location.pathname);
  if (migration) return <MigrationPage/>;
  if (entry) return <Home key={entry.slug} entry={entry} publicView={!editing}/>;
  if (!index) return <main className="catalog"><p>발표를 찾을 수 없습니다.</p><a href={BASE}>목록</a></main>;
  return <main className="catalog"><a href="https://jaeyeonkim.kr/">김재연</a>
    <div className="presentation-list">{presentations.map(p => <div className="catalog-row" key={p.slug}>
      <a href={`${BASE}${editing ? 'edit/' : ''}${p.slug}/`}><time>{p.date}</time><span>{p.title}</span></a>
    </div>)}</div>
    {!editing && <div className="older-list">{olderPresentations.map(([name,href]) => <a key={href} href={href}>{name}</a>)}</div>}
  </main>;
}
