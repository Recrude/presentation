import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { presentations, validCatalog } from '../app/catalog.ts';
import { validDeck, type Slide } from '../app/model.ts';
export const CHUNK_SIZE = 2 * 1024 * 1024;
const MAX_IMAGE = 40 * 1024 * 1024;
const extensions: Record<string,string> = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
export type GitApi = (path: string, method?: string, body?: unknown) => Promise<any>;
export class PublishError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
type ProofData = { kind: 'chunk' | 'asset'; slug: string; hash: string; sha: string; mime: string; index: number; count: number; length: number; expires: number };
type Proof = { data: ProofData; signature: string };
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const sign = (d: ProofData, secret: string): Proof => ({data:d,signature:createHmac('sha256',secret).update('presentation-upload:'+JSON.stringify(d)).digest('hex')});
function verify(value: any, secret: string, kind: string): ProofData {
  const d = value?.data;
  if (!d || d.kind !== kind || typeof value.signature !== 'string' || !/^[a-f0-9]{64}$/.test(value.signature) ||
      !presentations.some(p=>p.slug===d.slug) || !/^[a-f0-9]{64}$/.test(d.hash) || !/^[a-f0-9]{40}$/.test(d.sha) || !extensions[d.mime] ||
      !Number.isInteger(d.expires) || d.expires < Date.now()) throw new PublishError('업로드 확인 정보가 만료되었거나 올바르지 않습니다. 다시 게시하세요.');
  const expected=sign(d,secret).signature;
  if (!timingSafeEqual(Buffer.from(value.signature),Buffer.from(expected))) throw new PublishError('업로드 확인 정보가 올바르지 않습니다.');
  return d;
}
function imageHeader(bytes: Buffer, mime: string) {
  return mime==='image/png' ? bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))
    : mime==='image/jpeg' ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255
    : mime==='image/webp' ? bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP'
    : mime==='image/gif' ? /^GIF8[79]a$/.test(bytes.toString('ascii',0,6))
    : mime==='image/avif' ? bytes.toString('ascii',4,8)==='ftyp' && /avif|avis/.test(bytes.toString('ascii',8,32)) : false;
}
function ids(slides: Slide[]) { return [...new Set(slides.flatMap(s=>[...(s.photos?.map(p=>p.id)||[]),...(s.previewId?[s.previewId]:[])]))]; }
function assetPath(d: ProofData) { return `public/decks/${d.slug}/assets/${d.hash}.${extensions[d.mime]}`; }
function existingAsset(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m=value.match(/^\/presentations\/decks\/([a-z0-9-]+)\/assets\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif)$/);
  return !!m && presentations.some(p=>p.slug===m[1]);
}
export async function executePublish(input: any, git: GitApi, secret: string) {
  if (!input || typeof input !== 'object') throw new PublishError('게시 내용을 확인하세요.');
  if (input.action === 'upload') {
    const {slug,mime,content,index,count,hash:expectedHash}=input;
    if (!presentations.some(p=>p.slug===slug) || !extensions[mime] || !/^[a-f0-9]{64}$/.test(expectedHash) ||
        !Number.isInteger(count) || count<1 || count>20 || !Number.isInteger(index) || index<0 || index>=count ||
        typeof content!=='string' || content.length>Math.ceil(CHUNK_SIZE/3)*4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new PublishError('이미지 업로드 형식을 확인하세요.');
    const bytes=Buffer.from(content,'base64');
    if (!bytes.length || bytes.length>CHUNK_SIZE || bytes.toString('base64')!==content || (index<count-1 && bytes.length!==CHUNK_SIZE) ||
        (index===0 && !imageHeader(bytes,mime)) || (count===1 && hash(bytes)!==expectedHash)) throw new PublishError('이미지 파일을 확인하세요.');
    const blob=await git('git/blobs','POST',{content,encoding:'base64'});
    if (!/^[a-f0-9]{40}$/.test(blob.sha)) throw new PublishError('이미지를 저장하지 못했습니다.',502);
    return {proof:sign({kind:count===1?'asset':'chunk',slug,hash:expectedHash,mime,sha:blob.sha,index,count,length:bytes.length,expires:Date.now()+3600000},secret)};
  }
  if (input.action === 'assemble') {
    if (!Array.isArray(input.parts) || input.parts.length<2 || input.parts.length>20) throw new PublishError('이미지 조각을 확인하세요.');
    const parts=input.parts.map((p: unknown)=>verify(p,secret,'chunk')) as ProofData[];
    const first=parts[0];
    if (parts.some((p,i)=>p.index!==i || p.count!==parts.length || p.slug!==first.slug || p.hash!==first.hash || p.mime!==first.mime) || parts.reduce((sum,p)=>sum+p.length,0)>MAX_IMAGE) throw new PublishError('이미지 조각이 일치하지 않습니다.');
    const chunks: Buffer[]=[];
    for(const part of parts) {
      const blob=await git(`git/blobs/${part.sha}`);
      if (blob.encoding!=='base64' || typeof blob.content!=='string') throw new PublishError('이미지 조각을 읽지 못했습니다.',502);
      const bytes=Buffer.from(blob.content.replace(/\s/g,''),'base64');
      if(bytes.length!==part.length)throw new PublishError('이미지 조각 크기가 다릅니다.');
      chunks.push(bytes);
    }
    const bytes=Buffer.concat(chunks);
    if(hash(bytes)!==first.hash || !imageHeader(bytes,first.mime))throw new PublishError('이미지 파일 확인에 실패했습니다.');
    const blob=await git('git/blobs','POST',{content:bytes.toString('base64'),encoding:'base64'});
    return {proof:sign({...first,kind:'asset',sha:blob.sha,length:bytes.length,index:0,count:1,expires:Date.now()+3600000},secret)};
  }
  const tree: {path:string;mode:string;type:string;content?:string;sha?:string}[]=[];
  let snapshot: any, message: string;
  if(input.action==='catalog') {
    if(!validCatalog(input.config))throw new PublishError('발표 목록 형식을 확인하세요.');
    tree.push({path:'public/decks/catalog.json',mode:'100644',type:'blob',content:JSON.stringify(input.config,null,2)+'\n'});
    message='Update presentation order and visibility';
  } else if(input.action==='deck') {
    if(!presentations.some(p=>p.slug===input.slug) || !validDeck(input.slides))throw new PublishError('발표 형식을 확인하세요.');
    snapshot={version:1,slug:input.slug,slides:input.slides.filter((s:Slide)=>!s.hidden),assets:Object.create(null),publishedAt:new Date().toISOString()};
    const paths=new Set<string>();
    for(const id of ids(snapshot.slides)) {
      const value=input.assets?.[id];
      if(existingAsset(value)) {snapshot.assets[id]=value;continue;}
      const proof=verify(value,secret,'asset');
      if(proof.slug!==input.slug)throw new PublishError('다른 발표의 업로드 정보입니다.');
      const path=assetPath(proof);
      snapshot.assets[id]='/presentations/'+path.slice(7);
      if(!paths.has(path)){paths.add(path);tree.push({path,mode:'100644',type:'blob',sha:proof.sha});}
    }
    tree.push({path:`public/decks/${input.slug}/deck.json`,mode:'100644',type:'blob',content:JSON.stringify(snapshot,null,2)+'\n'});
    message=`Publish ${input.slug}`;
  } else throw new PublishError('지원하지 않는 게시 요청입니다.');
  // The server chooses every path, parent, tree and branch. Clients cannot write application code or force-push.
  const ref=await git('git/ref/heads/main');
  const parent=ref.object.sha;
  const commit=await git(`git/commits/${parent}`);
  const nextTree=await git('git/trees','POST',{base_tree:commit.tree.sha,tree});
  if(nextTree.sha===commit.tree.sha)return {published:true,unchanged:true,snapshot};
  const next=await git('git/commits','POST',{message,tree:nextTree.sha,parents:[parent]});
  await git('git/refs/heads/main','PATCH',{sha:next.sha,force:false});
  return {published:true,commit:next.sha,snapshot};
}
export function githubTransport(token: string): GitApi {
  return async (path,method='GET',body) => {
    const r=await fetch(`https://api.github.com/repos/Recrude/presentation/${path}`,{method,headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
    if(!r.ok)throw new PublishError(r.status===409 || r.status===422 ? '다른 게시가 먼저 반영되었습니다. 다시 게시하세요.' : r.status===403 || r.status===429 ? '게시 요청이 잠시 제한되었습니다. 잠시 후 다시 시도하세요.' : '서버에서 GitHub에 연결하지 못했습니다.',r.status===409 || r.status===422 ? 409 : 502);
    return r.json();
  };
}
