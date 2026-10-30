import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { executePublish, CHUNK_SIZE } from '../server/publish.ts';
import { catalogEntries, LEGACY_SLUG } from '../app/catalog.ts';
import handler from '../api/publish.ts';
const secret='test-upload-signature-key';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6mQAAAAASUVORK5CYII=','base64');
const hash=b=>createHash('sha256').update(b).digest('hex');
const config={version:1,items:catalogEntries.map(e=>({id:e.id,public:true}))};
function repository() {
  const calls=[],blobs=new Map();
  const git=async(path,method='GET',body)=>{
    calls.push({path,method,body});
    if(path==='git/blobs' && method==='POST') {const b=Buffer.from(body.content,'base64'),sha=createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');blobs.set(sha,b);return {sha};}
    if(path.startsWith('git/blobs/')) {const b=blobs.get(path.split('/').pop());return {encoding:'base64',content:b.toString('base64')};}
    if(path==='git/ref/heads/main')return {object:{sha:'a'.repeat(40)}};
    if(path==='git/commits/'+'a'.repeat(40))return {tree:{sha:'b'.repeat(40)}};
    if(path==='git/trees')return {sha:'c'.repeat(40)};
    if(path==='git/commits')return {sha:'d'.repeat(40)};
    if(path==='git/refs/heads/main')return {object:{sha:body.sha}};
    throw Error('Unexpected request');
  };
  return {git,calls,blobs};
}
test('server validates actions, paths and image receipts before committing only presentation data',async()=>{
  const {git,calls,blobs}=repository();
  const upload=await executePublish({action:'upload',slug:LEGACY_SLUG,mime:'image/png',hash:hash(png),count:1,index:0,content:png.toString('base64')},git,secret);
  const slide={id:'photo',title:'Photo',kind:'gallery',src:'',hidden:false,photos:[{id:'p',name:'image',width:1,height:1}]};
  const result=await executePublish({action:'deck',slug:LEGACY_SLUG,slides:[slide,{...slide,id:'hidden',hidden:true}],assets:{p:upload.proof}},git,secret);
  assert.equal(result.snapshot.slides.length,1);
  assert.match(result.snapshot.assets.p,/^\/presentations\/decks\/.+\/assets\/[a-f0-9]{64}\.png$/);
  const tree=calls.find(c=>c.path==='git/trees').body;assert.equal(tree.base_tree,'b'.repeat(40));assert.equal(tree.tree.length,2);assert.ok(tree.tree.every(e=>e.path.startsWith('public/decks/'+LEGACY_SLUG+'/')));assert.equal(calls.at(-1).body.force,false);
  const before=calls.length;
  for(const input of [
    {action:'git',path:'git/refs/heads/main',force:true},
    {action:'deck',slug:'../../api',slides:[],assets:{}},
    {action:'deck',slug:LEGACY_SLUG,slides:[slide],assets:{p:'/api/publish.ts'}},
    {action:'deck',slug:LEGACY_SLUG,slides:[slide],assets:{p:{...upload.proof,signature:'0'.repeat(64)}}},
    {action:'catalog',config:{version:1,items:[]}},
    {action:'upload',slug:LEGACY_SLUG,mime:'image/png',hash:hash(png),count:1,index:0,content:Buffer.from('<script>bad</script>').toString('base64')},
  ])await assert.rejects(()=>executePublish(input,git,secret));
  assert.equal(calls.length,before,'invalid requests never reach GitHub');
  assert.ok([...blobs.values()][0].equals(png));
});
test('large uploads are reassembled byte-for-byte and mismatched chunks fail',async()=>{
  const {git,blobs}=repository();const bytes=Buffer.concat([png,randomBytes(CHUNK_SIZE+50)]),digest=hash(bytes),proofs=[];
  for(let index=0;index<2;index++){const part=bytes.subarray(index*CHUNK_SIZE,(index+1)*CHUNK_SIZE);proofs.push((await executePublish({action:'upload',slug:LEGACY_SLUG,mime:'image/png',hash:digest,count:2,index,content:part.toString('base64')},git,secret)).proof);}
  await assert.rejects(()=>executePublish({action:'assemble',parts:[...proofs].reverse()},git,secret));
  const combined=await executePublish({action:'assemble',parts:proofs},git,secret);assert.equal(combined.proof.data.kind,'asset');assert.ok(blobs.get(combined.proof.data.sha).equals(bytes));
  const expired=structuredClone(combined.proof);expired.data.expires=0;
  await assert.rejects(()=>executePublish({action:'deck',slug:LEGACY_SLUG,slides:[{id:'x',title:'x',kind:'gallery',src:'',hidden:false,photos:[{id:'p',name:'p',width:1,height:1}]}],assets:{p:expired}},git,secret));
});
test('catalog publish preserves unrelated files and aborts on a concurrent branch update',async()=>{
  const repo=repository();await executePublish({action:'catalog',config},repo.git,secret);
  const tree=repo.calls.find(c=>c.path==='git/trees').body;assert.equal(tree.base_tree,'b'.repeat(40));assert.deepEqual(tree.tree.map(e=>e.path),['public/decks/catalog.json']);
  await assert.rejects(()=>executePublish({action:'catalog',config},async(path,method,body)=>{if(path==='git/refs/heads/main')throw Error('conflict');return repo.git(path,method,body);},secret),/conflict/);
});
test('HTTP publisher requires session, same-origin custom header, and keeps GitHub credential server-side',async()=>{
  const oldAuth=process.env.PRESENTATION_AUTH,oldToken=process.env.PRESENTATION_GITHUB_TOKEN,realFetch=globalThis.fetch;
  const sessionKey=randomBytes(32).toString('hex');
  process.env.PRESENTATION_AUTH=JSON.stringify({salt:'a'.repeat(32),hash:'b'.repeat(64),sessionKey});process.env.PRESENTATION_GITHUB_TOKEN='server-only-test-credential';
  const payload=String(Date.now()+3600000)+'.'+'c'.repeat(32),sig=createHmac('sha256',Buffer.from(sessionKey,'hex')).update('presentation-editor:'+payload).digest('hex');
  const cookie='__Secure-presentation-edit='+payload+'.'+sig;
  const repo=repository();
  globalThis.fetch=async(url,options)=>{assert.ok(String(url).startsWith('https://api.github.com/repos/Recrude/presentation/git/'));assert.equal(options.headers.Authorization,'Bearer server-only-test-credential');const data=await repo.git(String(url).split('/presentation/')[1],options.method,options.body?JSON.parse(options.body):undefined);return new Response(JSON.stringify(data));};
  async function invoke(headers,body={action:'catalog',config},method='POST') {const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=JSON.parse(value);}};await handler({method,headers,body},res);return res;}
  const headers={cookie,origin:'https://jaeyeonkim.kr','x-presentation-publish':'1','content-type':'application/json'};
  try {
    assert.equal((await invoke({...headers,cookie:''})).statusCode,401);
    assert.equal((await invoke({...headers,origin:'https://attacker.test'})).statusCode,403);
    assert.equal((await invoke({...headers,'x-presentation-publish':''})).statusCode,403);
    assert.equal((await invoke(headers,{},'GET')).statusCode,405);assert.equal(repo.calls.length,0);
    const result=await invoke(headers);assert.equal(result.statusCode,200);assert.equal(result.body.published,true);assert.ok(!JSON.stringify(result.body).includes(process.env.PRESENTATION_GITHUB_TOKEN));assert.match(result.headers['Cache-Control'],/no-store/);
  }finally{globalThis.fetch=realFetch;if(oldAuth===undefined)delete process.env.PRESENTATION_AUTH;else process.env.PRESENTATION_AUTH=oldAuth;if(oldToken===undefined)delete process.env.PRESENTATION_GITHUB_TOKEN;else process.env.PRESENTATION_GITHUB_TOKEN=oldToken;}
});
