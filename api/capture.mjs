import { lookup } from 'node:dns/promises';
import path from 'node:path';
import { isIP, BlockList } from 'node:net';
import puppeteer from 'puppeteer-core';

const privateV4 = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]]) privateV4.addSubnet(ip,bits);
const publicV6 = new BlockList(); publicV6.addSubnet('2000::',3,'ipv6');
export function isPublicAddress(address) {
  return isIP(address) === 4 ? !privateV4.check(address) : isIP(address) === 6 && publicV6.check(address,'ipv6');
}
export function captureTarget(raw) {
  const u = new URL(raw);
  if(u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw Error('HTTPS 주소만 캡처할 수 있습니다.');
  const allowed = ['ved.kr','whatareyoudoingnow.vercel.app','jaeyeonkim.kr', ...(process.env.CAPTURE_ALLOWED_HOSTS || '').split(',').map(s=>s.trim()).filter(Boolean)];
  if(['www.youtube-nocookie.com','www.youtube.com','youtu.be'].includes(u.hostname)) {
    const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.split('/').pop();
    if(!/^[\w-]{11}$/.test(id || '')) throw Error('영상 주소를 확인하세요.');
    return {kind:'youtube',id};
  }
  if(!allowed.includes(u.hostname)) throw Error('이 웹사이트는 자동 캡처 대상이 아닙니다. 캡처 이미지 파일을 지정하세요.');
  return {kind:'web',url:u.href,allowed};
}
export async function capture(raw) {
  const target=captureTarget(raw);
  if(target.kind==='youtube') {
    for(const size of ['maxresdefault','hqdefault']) {
      const response=await fetch(`https://i.ytimg.com/vi/${target.id}/${size}.jpg`,{signal:AbortSignal.timeout(12000)});
      if(response.ok && response.headers.get('content-type')?.startsWith('image/')) return Buffer.from(await response.arrayBuffer());
    }
    throw Error('영상 미리보기 이미지를 불러오지 못했습니다.');
  }
  const local=process.env.CHROME_EXECUTABLE_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':null);
  const chromium=local?null:(await import('@sparticuz/chromium')).default;
  if (chromium) await chromium.font(path.join(process.cwd(), 'api/fonts/NotoSansKR.ttf'));
  const browser=await puppeteer.launch({executablePath:local || await chromium.executablePath(),args:local?[]:await puppeteer.defaultArgs({args:chromium.args,headless:'shell'}),headless:local?true:'shell'});
  try {
    const page=await browser.newPage(); await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
    const checked=new Map();
    async function safe(url) {
      const u=new URL(url);
      if(!['http:','https:'].includes(u.protocol) || u.username || u.password) return false;
      if(!checked.has(u.hostname)) checked.set(u.hostname,lookup(u.hostname,{all:true}).then(list=>list.length>0 && list.every(x=>isPublicAddress(x.address))).catch(()=>false));
      return checked.get(u.hostname);
    }
    await page.setRequestInterception(true);
    page.on('request', async req=>{
      try {
        const u=new URL(req.url());
        if(['data:','blob:','about:'].includes(u.protocol)) return void req.continue();
        if(req.isNavigationRequest() && req.frame()===page.mainFrame() && !target.allowed.includes(u.hostname)) return void req.abort();
        if(await safe(req.url())) await req.continue();else await req.abort();
      }catch{if(!req.isInterceptResolutionHandled()) await req.abort().catch(()=>{});}
    });
    const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:25000});
    if(!response || response.status()>=400) throw Error('웹페이지를 불러오지 못했습니다.');
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,4000))]));
    await page.waitForNetworkIdle({idleTime:500,timeout:5000}).catch(()=>{});
    await new Promise(r=>setTimeout(r,1800));
    return Buffer.from(await page.screenshot({type:'jpeg',quality:90,fullPage:false}));
  } finally {await browser.close();}
}
export default async function handler(req,res) {
  if(req.method !== 'GET'){res.statusCode=405;res.end();return;}
  const url=new URL(req.url,'http://localhost').searchParams.get('url');
  if(!url || url.length>2048){res.statusCode=400;res.end('주소를 확인하세요.');return;}
  try {
    const bytes=await capture(url);res.statusCode=200;
    res.setHeader('Content-Type','image/jpeg');res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');res.end(bytes);
  } catch(e) {res.statusCode=422;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(e instanceof Error?e.message:'캡처 실패');}
}
