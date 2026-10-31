import {test} from 'node:test';
import assert from 'node:assert/strict';
import {catalogEntries,validCatalog,validDeckId,route,deckEntry,mergeDraft,LEGACY_SLUG} from '../app/catalog.ts';
const base={version:1,items:catalogEntries.map(e=>({id:e.id,public:true}))};
const item={id:'deck-12345678-abcd-4abc-8abc-123456789abc',public:false,presentation:{title:'새 발표',date:'2026-11-03',slug:'new-talk'}};
test('dynamic catalog keeps legacy data and uses stable identity across URL changes',()=>{
 assert.ok(validCatalog(base));const config={version:1,items:[item,...base.items]};assert.ok(validCatalog(config));
 assert.equal(route('/presentations/edit/new-talk/',config).entry.slug,item.id);
 assert.equal(route('/presentations/new-talk/',config).entry.title,'새 발표');
 assert.equal(route('/presentations/edit/260909-ahn/',config).entry.slug,LEGACY_SLUG);
 const renamed={...item,presentation:{...item.presentation,slug:'renamed',title:'변경'}};
 assert.equal(deckEntry(renamed).slug,item.id);assert.equal(route('/presentations/renamed/',{version:1,items:[renamed,...base.items]}).entry.slug,item.id);
 assert.equal(route('/presentations/new-talk/',{version:1,items:[renamed,...base.items]}).entry,undefined);
 const merged=mergeDraft(config,{version:1,items:[...base.items].reverse()});assert.equal(merged.items.at(-1).id,item.id);assert.equal(merged.items[0].id,base.items.at(-1).id);
});
test('invalid dates, duplicate/reserved slugs and path-like IDs are rejected',()=>{
 for(const slug of ['edit','api','decks','login','260909-ahn',LEGACY_SLUG,'../x','foo/bar','foo--bar','UPPER'])assert.equal(validCatalog({version:1,items:[{...item,presentation:{...item.presentation,slug}},...base.items]}),false,slug);
 for(const date of ['2026-02-30','2026-13-01','2026.11.03',''])assert.equal(validCatalog({version:1,items:[{...item,presentation:{...item.presentation,date}},...base.items]}),false,date);
 assert.equal(validDeckId('../api'),false);assert.equal(validCatalog({version:1,items:[item,item,...base.items]}),false);
});
