import { BASE, validDeckId, validCatalog, type CatalogItem, type CatalogConfig } from './catalog';
import { assetIds, type Snapshot } from './published';
import { type Format, type Slide, validDeck, assetTypes, MAX_ASSET } from './model';
const CHUNK_SIZE = 2 * 1024 * 1024, PARALLEL = 3;
// Images over KEEP_UNDER go up as WebP at most MAX_EDGE px on the long side: twice the 1920 sheet, sharp on Retina·4K
// screens and at 2× zoom (a 6000×4000 15 MB JPEG becomes about 1 MB). Smaller files go as they are.
const MAX_EDGE = 3840, QUALITY = 0.82, KEEP_UNDER = 1024 * 1024;
const shrinkable = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
async function optimize(blob: Blob) {
  if (!shrinkable.has(blob.type) || blob.size <= KEEP_UNDER) return blob;
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)), g = canvas.getContext('2d')!;
    g.imageSmoothingQuality = 'high'; g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const small = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
    return small.size < blob.size ? small : blob;
  } catch { return blob; } // One the browser cannot redraw goes as it is.
  finally { bitmap?.close(); }
}
// Uploads of this page, by deck and content, kept while their receipts last: publishing again after a failure
// carries on from them.
const receipts = new Map<string, { data: { expires: number } }>();
async function api(body: unknown, waiting?: (s: string) => void) {
  for (let attempt = 0; ; attempt++) {
    const r=await fetch(`${BASE}api/publish/`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Presentation-Publish':'1'},body:JSON.stringify(body),signal:AbortSignal.timeout(90000)});
    let result;try{result=await r.json();}catch{}
    // GitHub limited the writes: wait as long as it asks (a few times) and carry on from this file.
    if(r.status===429 && attempt<3) {
      const seconds=Math.min(Math.max(Number(result?.retryAfter) || 60,1),120);
      waiting?.(`GitHub 요청 제한 · ${seconds}초 뒤 이어서 올립니다`);
      await new Promise(resolve=>setTimeout(resolve,seconds*1000));
      continue;
    }
    if(!r.ok)throw Error(r.status===401 ? '로그인이 만료되었습니다. 다시 로그인한 뒤 게시하세요.' : result?.error || '게시하지 못했습니다. 편집 내용은 유지됩니다.');
    return result;
  }
}
/**
 * Every file once, by its content: one the site already has (an earlier publish of this deck) is used where it is,
 * the others go up three at a time, large images made smaller first. Answers the published snapshot and how many
 * files went up.
 */
export async function publishDeck(slug: string, slides: Slide[], assets: Record<string,string>, progress: (s:string)=>void, format?: Format) {
  if(!validDeckId(slug) || !validDeck(slides))throw Error('발표 형식을 확인하세요.');
  const visible=slides.filter(s=>!s.hidden), uploaded:Record<string,unknown>={}, files=new Map<string,Promise<unknown>>();
  const ids=assetIds(visible);
  let next=0, done=0, sent=0, bytesSent=0, failed=false;
  // Where it is: files done of all, and the megabytes sent so far (they move while a large file goes up).
  const report=()=>progress(`파일 게시 ${done}/${ids.length} · ${Math.round(bytesSent/1048576)}MB`);
  const upload=async (mime: string, hash: string, bytes: Uint8Array) => {
    const path=`${BASE}decks/${slug}/assets/${hash}.${assetTypes[mime]}`, key=`${slug}/${hash}`;
    const kept=receipts.get(key);
    if(kept && kept.data.expires-Date.now()>600000){sent++;return kept;}
    // The file's name is its content's hash, so the same name with the same type on the site is the same file.
    const there=await fetch(path,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(15000)}).catch(()=>null);
    if(there?.ok && there.headers.get('content-type')?.split(';')[0].trim()===mime)return path;
    sent++;
    const count=Math.ceil(bytes.length/CHUNK_SIZE),parts=[];
    for(let index=0;index<count;index++) {
      const chunk=bytes.subarray(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE);
      let binary='';for(let j=0;j<chunk.length;j+=8192)binary+=String.fromCharCode(...chunk.subarray(j,j+8192));
      parts.push((await api({action:'upload',slug,mime,hash,index,count,content:btoa(binary)},progress)).proof);
      bytesSent+=chunk.length;report();
    }
    const receipt=count===1?parts[0]:(await api({action:'assemble',parts},progress)).proof;
    receipts.set(key,receipt);
    return receipt;
  };
  const send=async (id: string) => {
    const source=assets[id];
    if(!source)throw Error('누락된 이미지가 있습니다. 다시 추가한 뒤 게시하세요.');
    if(/^\/presentations\/decks\/[a-z0-9-]+\/assets\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif|svg|mp4|webm)$/.test(source)){uploaded[id]=source;return;}
    const r=await fetch(source);if(!r.ok)throw Error('이미지 파일을 읽지 못했습니다.');
    const blob=await optimize(await r.blob());
    if(!assetTypes[blob.type] || !blob.size || blob.size>MAX_ASSET)throw Error('40MB 이하의 이미지·영상 파일만 게시할 수 있습니다.');
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
    if(!files.has(hash))files.set(hash,upload(blob.type,hash,bytes));
    uploaded[id]=await files.get(hash);
  };
  const worker=async () => {
    while(!failed && next<ids.length) {
      try{await send(ids[next++]);}catch(e){failed=true;throw e;}
      done++;report();
    }
  };
  await Promise.all(Array.from({length:PARALLEL},worker));
  progress('게시 중');
  const result=await api({action:'deck',slug,format,slides:visible,assets:uploaded},progress);
  for(const key of receipts.keys())if(key.startsWith(slug+'/'))receipts.delete(key);
  return {snapshot:result.snapshot as Snapshot,sent};
}
export async function publishCatalog(config: CatalogConfig) {
  if(!validCatalog(config))throw Error('발표 목록 형식을 확인하세요.');
  return api({action:'catalog',config});
}

export async function createPresentation(item: CatalogItem) { return api({action:"create",item}); }
