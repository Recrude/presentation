import { lookup } from 'node:dns/promises';
import path from 'node:path';
import os from 'node:os';
import { copyFile, mkdir } from 'node:fs/promises';
import { isIP, BlockList } from 'node:net';
import puppeteer from 'puppeteer-core';
import { instagramHandler } from '../server/instagram.mjs';

const privateV4 = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.168.0.0',16],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]]) privateV4.addSubnet(ip,bits);
const publicV6 = new BlockList(); publicV6.addSubnet('2000::',3,'ipv6');
export function isPublicAddress(address) {
  return isIP(address) === 4 ? !privateV4.check(address) : isIP(address) === 6 && publicV6.check(address,'ipv6');
}
// Only the signed-in editor reaches this endpoint (middleware). Any public HTTPS site can be captured;
// every request the page makes, redirects included, must resolve to public addresses.
export function captureTarget(raw) {
  const u = new URL(raw);
  if(u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || isIP(u.hostname.replace(/^\[|\]$/g,''))) throw Error('HTTPS 주소만 캡처할 수 있습니다.');
  if(['www.youtube-nocookie.com','www.youtube.com','youtu.be'].includes(u.hostname)) {
    const id=u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.split('/').pop();
    if(!/^[\w-]{11}$/.test(id || '')) throw Error('영상 주소를 확인하세요.');
    return {kind:'youtube',id};
  }
  return {kind:'web',url:u.href};
}
/**
 * The browser window's toolbar color, always read in the light color scheme (runs inside the captured
 * page): the theme-color meta for light; else the body's background; else the root's; else white.
 */
export function pageToolbarColor() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = css => { g.clearRect(0, 0, 1, 1); g.fillStyle = 'transparent'; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const white = [255, 255, 255, 1];
  for (const meta of document.querySelectorAll('meta[name="theme-color" i]')) {
    const media = meta.getAttribute('media'), value = (meta.getAttribute('content') || '').trim();
    if ((media && !matchMedia(media).matches) || !CSS.supports('color', value)) continue;
    const color = rgba(value);
    if (color[3] > 0) return hex(over(color, white));
  }
  const root = over(rgba(getComputedStyle(document.documentElement).backgroundColor), white);
  const body = document.body ? rgba(getComputedStyle(document.body).backgroundColor) : [0, 0, 0, 0];
  return hex(body[3] > 0 ? over(body, root) : root);
}
const color = value => /^#[0-9a-f]{6}$/.test(value || '') ? value : undefined;
/** The preview image and, for web pages, the browser window's toolbar color (light color scheme). */
export async function capture(raw) {
  const target=captureTarget(raw);
  if(target.kind==='youtube') {
    for(const size of ['maxresdefault','hqdefault']) {
      const response=await fetch(`https://i.ytimg.com/vi/${target.id}/${size}.jpg`,{signal:AbortSignal.timeout(12000)});
      if(response.ok && response.headers.get('content-type')?.startsWith('image/')) return {bytes:Buffer.from(await response.arrayBuffer())};
    }
    throw Error('영상 미리보기 이미지를 불러오지 못했습니다.');
  }
  const local=process.env.CHROME_EXECUTABLE_PATH || (process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':null);
  const chromium=local?null:(await import('@sparticuz/chromium')).default;
  const executablePath=local || await chromium.executablePath();
  // Serverless Chromium reads fonts from /tmp/fonts, which executablePath() has just unpacked (with its
  // fonts.conf); Korean pages need Noto Sans KR there before launch.
  if (chromium) { const fonts=path.join(os.tmpdir(),'fonts'); await mkdir(fonts,{recursive:true}); await copyFile(path.join(process.cwd(),'api/fonts/NotoSansKR.ttf'),path.join(fonts,'NotoSansKR.ttf')); }
  const browser=await puppeteer.launch({executablePath,args:local?[]:await puppeteer.defaultArgs({args:chromium.args,headless:'shell'}),headless:local?true:'shell'});
  try {
    // The preview and the toolbar color are both the page's light color scheme, whatever the viewer uses.
    const page=await browser.newPage(); await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
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
        if(await safe(req.url())) await req.continue();else await req.abort();
      }catch{if(!req.isInterceptResolutionHandled()) await req.abort().catch(()=>{});}
    });
    const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:25000});
    if(!response || response.status()>=400) throw Error('웹페이지를 불러오지 못했습니다.');
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,4000))]));
    await page.waitForNetworkIdle({idleTime:500,timeout:5000}).catch(()=>{});
    await new Promise(r=>setTimeout(r,1800));
    const bytes=Buffer.from(await page.screenshot({type:'jpeg',quality:90,fullPage:false}));
    return {bytes,toolbar:color(await page.evaluate(pageToolbarColor))};
  } finally {await browser.close();}
}
export default async function handler(req,res) {
  if(req.method !== 'GET'){res.statusCode=405;res.end();return;}
  // Instagram posts come through this already-routed, editor-only endpoint (see server/instagram.mjs).
  const query=new URL(req.url,'http://localhost').searchParams;
  if(query.has('instagram') || query.has('instagram-asset')){await instagramHandler(query,res);return;}
  const url=query.get('url');
  if(!url || url.length>2048){res.statusCode=400;res.end('주소를 확인하세요.');return;}
  try {
    const {bytes,toolbar}=await capture(url);res.statusCode=200;
    if(toolbar)res.setHeader('X-Toolbar-Color',toolbar);
    res.setHeader('Content-Type','image/jpeg');res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');res.end(bytes);
  } catch(e) {res.statusCode=422;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(e instanceof Error?e.message:'캡처 실패');}
}
