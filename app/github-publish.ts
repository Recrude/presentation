import { BASE, validDeckId, validCatalog, type CatalogItem, type CatalogConfig } from './catalog';
import { assetIds, type Snapshot } from './published';
import { type Slide, validDeck, assetTypes, MAX_ASSET } from './model';
const CHUNK_SIZE = 2 * 1024 * 1024;
async function api(body: unknown) {
  const r=await fetch(`${BASE}api/publish/`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Presentation-Publish':'1'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
  let result;try{result=await r.json();}catch{}
  if(!r.ok)throw Error(r.status===401 ? '로그인이 만료되었습니다. 다시 로그인한 뒤 게시하세요.' : result?.error || '게시하지 못했습니다. 편집 내용은 유지됩니다.');
  return result;
}
export async function publishDeck(slug: string, slides: Slide[], assets: Record<string,string>, progress: (s:string)=>void) {
  if(!validDeckId(slug) || !validDeck(slides))throw Error('발표 형식을 확인하세요.');
  const visible=slides.filter(s=>!s.hidden), uploaded:Record<string,unknown>={}, dedupe=new Map<string,unknown>();
  const ids=assetIds(visible);
  for(let i=0;i<ids.length;i++) {
    const id=ids[i],source=assets[id];
    if(!source)throw Error('누락된 이미지가 있습니다. 다시 추가한 뒤 게시하세요.');
    if(/^\/presentations\/decks\/[a-z0-9-]+\/assets\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif|svg|mp4|webm)$/.test(source)){uploaded[id]=source;continue;}
    const r=await fetch(source);if(!r.ok)throw Error('이미지 파일을 읽지 못했습니다.');
    const blob=await r.blob();
    if(!assetTypes[blob.type] || !blob.size || blob.size>MAX_ASSET)throw Error('40MB 이하의 이미지·영상 파일만 게시할 수 있습니다.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(dedupe.has(hash)){uploaded[id]=dedupe.get(hash);continue;}
    const count=Math.ceil(bytes.length/CHUNK_SIZE),parts=[];
    for(let index=0;index<count;index++) {
      progress(`파일 게시 ${i+1}/${ids.length}${count>1?` · ${index+1}/${count}`:''}`);
      const chunk=bytes.subarray(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE);
      let binary='';for(let j=0;j<chunk.length;j+=8192)binary+=String.fromCharCode(...chunk.subarray(j,j+8192));
      const result=await api({action:'upload',slug,mime:blob.type,hash,index,count,content:btoa(binary)});parts.push(result.proof);
    }
    const proof=count===1?parts[0]:(await api({action:'assemble',parts})).proof;
    uploaded[id]=proof;dedupe.set(hash,proof);
  }
  progress('게시 중');
  const result=await api({action:'deck',slug,slides:visible,assets:uploaded});
  return result.snapshot as Snapshot;
}
export async function publishCatalog(config: CatalogConfig) {
  if(!validCatalog(config))throw Error('발표 목록 형식을 확인하세요.');
  return api({action:'catalog',config});
}

export async function createPresentation(item: CatalogItem) { return api({action:"create",item}); }
