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
 * Safari tints its toolbar with the page (runs inside the captured page): the theme-color meta for the
 * current color scheme; else the solid color along the top edge, sampled at five points like WebKit and
 * rejected where an image, background image, canvas, video, iframe, fixed or animated element sits;
 * else the document background.
 */
export function pageToolbarColor() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = css => { g.clearRect(0, 0, 1, 1); g.fillStyle = 'transparent'; g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  const lab = c => {
    const [r, gr, b] = c.slice(0, 3).map(v => (v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const [x, y, z] = [(0.4124 * r + 0.3576 * gr + 0.1805 * b) / 0.95047, 0.2126 * r + 0.7152 * gr + 0.0722 * b, (0.0193 * r + 0.1192 * gr + 0.9505 * b) / 1.08883]
      .map(t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  };
  const differ = (a, b) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) > 5; };
  const root = document.documentElement, body = document.body;
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && /dark/.test(getComputedStyle(root).colorScheme);
  const base = dark ? [18, 18, 18, 1] : [255, 255, 255, 1];
  for (const meta of document.querySelectorAll('meta[name="theme-color" i]')) {
    const media = meta.getAttribute('media'), value = (meta.getAttribute('content') || '').trim();
    if ((media && !matchMedia(media).matches) || !CSS.supports('color', value)) continue;
    const color = rgba(value);
    if (color[3] > 0) return hex(over(color, base));
  }
  // The root background, or the body's when the root has none, fills the whole canvas.
  const rootBackground = rgba(getComputedStyle(root).backgroundColor), bodyBackground = body ? rgba(getComputedStyle(body).backgroundColor) : [0, 0, 0, 0];
  const documentColor = over(rootBackground[3] > 0 ? rootBackground : bodyBackground, base);
  const sample = x => {
    let color = documentColor;
    for (const element of document.elementsFromPoint(x, 0).reverse()) {
      const style = getComputedStyle(element);
      if (style.position === 'fixed' || style.backgroundImage !== 'none' || style.animationName !== 'none' ||
        /^(img|picture|canvas|video|iframe|embed|object|svg)$/.test(element.localName)) return null;
      if (element === root || (element === body && rootBackground[3] === 0)) continue;
      const background = rgba(style.backgroundColor);
      if (background[3] > 0) color = over(background, color);
    }
    return color;
  };
  let samples = [0, 1, 2, 3, 4].map(i => sample((root.clientWidth - 1) * i / 4));
  if (samples.every(Boolean)) {
    const changes = samples.slice(1).map((color, i) => differ(samples[i], color));
    const count = changes.filter(Boolean).length;
    // One differing sample at either end (a corner element, a scrollbar) is left out.
    if (count === 1 && changes[0]) samples = samples.slice(1);
    else if (count === 1 && changes[3]) samples = samples.slice(0, 4);
    if (count === 0 || (count === 1 && (changes[0] || changes[3])))
      return hex([0, 1, 2].map(i => samples.reduce((sum, c) => sum + c[i], 0) / samples.length));
  }
  return hex(documentColor);
}
const color = value => /^#[0-9a-f]{6}$/.test(value || '') ? value : undefined;
/** The preview image and, for web pages, Safari's toolbar color in the light and dark color schemes. */
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
        if(await safe(req.url())) await req.continue();else await req.abort();
      }catch{if(!req.isInterceptResolutionHandled()) await req.abort().catch(()=>{});}
    });
    const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:25000});
    if(!response || response.status()>=400) throw Error('웹페이지를 불러오지 못했습니다.');
    await page.evaluate(()=>Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,4000))]));
    await page.waitForNetworkIdle({idleTime:500,timeout:5000}).catch(()=>{});
    await new Promise(r=>setTimeout(r,1800));
    const bytes=Buffer.from(await page.screenshot({type:'jpeg',quality:90,fullPage:false}));
    const light=color(await page.evaluate(pageToolbarColor));
    await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const dark=color(await page.evaluate(pageToolbarColor));
    return {bytes,toolbar:light && {light,dark:dark || light}};
  } finally {await browser.close();}
}
export default async function handler(req,res) {
  if(req.method !== 'GET'){res.statusCode=405;res.end();return;}
  const url=new URL(req.url,'http://localhost').searchParams.get('url');
  if(!url || url.length>2048){res.statusCode=400;res.end('주소를 확인하세요.');return;}
  try {
    const {bytes,toolbar}=await capture(url);res.statusCode=200;
    if(toolbar){res.setHeader('X-Toolbar-Color',toolbar.light);res.setHeader('X-Toolbar-Color-Dark',toolbar.dark);}
    res.setHeader('Content-Type','image/jpeg');res.setHeader('Cache-Control','public, max-age=300, s-maxage=3600');res.end(bytes);
  } catch(e) {res.statusCode=422;res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(e instanceof Error?e.message:'캡처 실패');}
}
