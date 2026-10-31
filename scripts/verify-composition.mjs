// Text, sequence, clip and browser-frame slides: edit → save → publish (mock GitHub, real server checks)
// → public playback. Compares live text (editor) with its published SVG outlines pixel by pixel.
// Needs the dev server on 3100, Google Chrome, SM3신중고딕-03 and SF Pro Display installed, ffmpeg.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { executePublish, safeSvg } from '../server/publish.ts';
import { catalogEntries } from '../app/catalog.ts';
const base = 'http://127.0.0.1:3100/presentations/';
const ID = '2026-11-03-yoon-jaeyoung-graduation-project';
const fontDir = path.join(os.homedir(), 'Library/Fonts');
const userFont = name => fs.readFileSync(path.join(fontDir, fs.readdirSync(fontDir).find(n => n.normalize('NFC') === name)));
const fonts = {
  'SM3SJGothic-03': userFont('SM3신중고딕-03.otf'), 'SFProDisplay-Regular': fs.readFileSync('/Library/Fonts/SF-Pro-Display-Regular.otf'),
  'SM3KGothic-Regular': userFont('SM3견출고딕-Regular.otf'), 'Pretendard-Bold': userFont('Pretendard-Bold.otf'),
  'SuisseIntl-SemiBold': userFont('SuisseIntl-SemiBold.otf'), 'SuisseIntl-SemiBoldItalic': userFont('SuisseIntl-SemiBoldItalic.otf'),
};
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-composition-'));
const clip = path.join(work, 'clip.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=1.5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
const imageDir = new URL('../../261103-yun/portfolio-images/2025.12-audio-morphology/', import.meta.url).pathname;
const images = fs.readdirSync(imageDir).filter(n => n.endsWith('.webp')).sort().slice(0, 6).map(n => path.join(imageDir, n));
const out = process.env.VERIFY_OUT || work;

const registry = { version: 1, items: catalogEntries.map(e => ({ id: e.id, public: true })) };
const blobs = new Map(), files = new Map();
let pending = [];
const git = async (p, method = 'GET', body) => {
  if (p.startsWith('contents/public/decks/catalog.json?ref=')) return { content: Buffer.from(JSON.stringify(registry)).toString('base64') };
  if (p === 'git/blobs' && method === 'POST') { const b = Buffer.from(body.content, 'base64'), sha = createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'); blobs.set(sha, b); return { sha }; }
  if (p.startsWith('git/blobs/')) return { encoding: 'base64', content: blobs.get(p.split('/').pop()).toString('base64') };
  if (p === 'git/ref/heads/main') return { object: { sha: 'a'.repeat(40) } };
  if (p === 'git/commits/' + 'a'.repeat(40)) return { tree: { sha: 'b'.repeat(40) } };
  if (p === 'git/trees') { pending = body.tree; return { sha: 'c'.repeat(40) }; }
  if (p === 'git/commits') return { sha: 'd'.repeat(40) };
  if (p === 'git/refs/heads/main') { for (const t of pending) files.set(t.path, t.content !== undefined ? Buffer.from(t.content) : blobs.get(t.sha)); return {}; }
  throw Error('Unexpected Git request ' + p);
};
const types = { svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };
let stripAdvance = false;
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.on('dialog', d => d.accept());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/decks/catalog.json')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(registry) });
    if (url.pathname.endsWith('/api/publish/')) {
      try { return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(await executePublish(JSON.parse(req.postData()), git, 'test-secret')) }); }
      catch (e) { return req.respond({ status: e.status || 500, contentType: 'application/json', body: JSON.stringify({ error: e.message }) }); }
    }
    if (url.pathname.startsWith(`/presentations/decks/${ID}/`)) {
      const key = 'public/' + url.pathname.slice('/presentations/'.length);
      let file = files.get(key);
      if (file && stripAdvance && key.endsWith('deck.json')) { const deck = JSON.parse(file); deck.slides.forEach(s => delete s.advance); file = Buffer.from(JSON.stringify(deck)); }
      return req.respond(file ? { status: 200, contentType: types[key.split('.').pop()] || 'application/json', body: file } : { status: 404, body: '{}' });
    }
    return req.continue();
  });
  const button = async (label, scope = '') => {
    await page.waitForFunction((label, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled && !b.closest('[inert]')), { timeout: 30000 }, label, scope);
    await page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label).click(), label, scope);
  };
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const field = async (label, value) => {
    const handle = await page.evaluateHandle(label => [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith(label))?.querySelector('input,select'), label);
    const tag = await handle.evaluate(e => e.tagName);
    if (tag === 'SELECT') await handle.select(value);
    else { await handle.evaluate(e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await handle.type(String(value)); }
    assert.equal(String(await handle.evaluate(e => e.value)), String(value), label);
  };
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 60000 }, text);

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar');
  await ready();
  // Fonts as a user who picked the files once (Cache Storage), independent of installed fonts.
  for (const [name, bytes] of Object.entries(fonts)) await page.evaluate(async (name, b64) => {
    const cache = await caches.open('presentation-fonts-v1');
    await cache.put(new Request(new URL('/presentation-fonts/' + name, location.origin)), new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
  }, name, bytes.toString('base64'));
  await page.reload();
  await page.waitForSelector('.toolbar');
  await ready();
  assert.equal(await page.$$eval('.card', c => c.length), 0, '11/3 deck starts empty');

  await button('추가', '.toolbar'); await button('텍스트');
  const text = '시각 공학 디자인 Visual Engineering Design은 제가 추구하는 디자인의 개념을 정립해 가는 디자인 실천의 과정입니다. 2026년 4월 “Human Signal” — 전시.\n\n두 번째 문단: 동작하는 것을 좋아하는, 구성된 형태와 시각에 생명력을 불어넣는 작업들.';
  await page.type('.text-editor', text);
  await field('크기', 64);
  await field('자동 넘김', 1.5);

  await button('추가', '.toolbar');
  let [chooser] = await Promise.all([page.waitForFileChooser(), button('시퀀스')]);
  await chooser.accept(images);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 2);
  await ready();
  await field('간격', 300); await field('한 번에', 2); await field('끝나면', 'next');
  await page.evaluate(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.includes('디졸브')).querySelector('input').click());

  await button('추가', '.toolbar');
  [chooser] = await Promise.all([page.waitForFileChooser(), button('클립')]);
  await chooser.accept([clip]);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 3);
  await ready();
  await field('끝나면', 'next');

  await button('추가', '.toolbar');
  await page.type('[aria-label="웹 또는 영상 주소"]', 'https://ved.kr/');
  await button('링크 추가');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 4);
  assert.ok(await page.$('.preview .browser-window'), 'new web slide uses the Safari frame');
  await button('추가', '.toolbar'); await button('텍스트');
  await page.type('.text-editor', '**시각 공학 디자인 Visual Engineering Design**\n\n본문은 보통 굵기로, **강조 “말” 2026** 섞어 쓰기.');
  await field('크기', 72);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 5);
  await page.screenshot({ path: path.join(out, 'editor-web.png') });

  await page.click('.card:first-child .thumbnail');
  await page.screenshot({ path: path.join(out, 'editor-text.png') });
  await button('저장'); await status('이 브라우저에 저장됨');
  await button('게시'); await status('게시됨');
  const deck = JSON.parse(files.get(`public/decks/${ID}/deck.json`));
  assert.deepEqual(deck.slides.map(s => s.kind), ['text', 'sequence', 'clip', 'web', 'text']);
  const [t, seq, cl, web, bold] = deck.slides;
  const boldSvg = files.get('public/' + deck.assets[bold.previewId].slice('/presentations/'.length)).toString();
  assert.ok(safeSvg(Buffer.from(boldSvg)));
  const ratios = new Set([...boldSvg.matchAll(/scale\(([\d.]+) ([\d.]+)\)/g)].map(m => (m[1] / m[2]).toFixed(2)));
  assert.deepEqual([...ratios].sort(), ['0.98', '0.99'], '볼드 한글 98%, 로마자·숫자 99% 장평');
  assert.match(deck.assets[t.previewId], /\.svg$/);
  const svg = files.get('public/' + deck.assets[t.previewId].slice('/presentations/'.length));
  assert.ok(safeSvg(svg), 'published SVG passes the server allowlist');
  assert.ok(!/<text|font-face|@font/.test(svg.toString()), 'no font data or live text in the SVG');
  assert.equal(seq.perFrame, 2); assert.equal(seq.photos.length, 6); assert.equal(seq.end, 'next'); assert.equal(seq.transition, 'dissolve');
  assert.match(deck.assets[cl.media.id], /\.mp4$/); assert.match(deck.assets[cl.previewId], /\.(webp|png)$/);
  assert.equal(web.frame, 'browser'); assert.equal(t.advance, 1.5);
  // Server rejects scripted SVG even with a valid header.
  await assert.rejects(() => executePublish({ action: 'upload', slug: ID, mime: 'image/svg+xml', hash: createHash('sha256').update('<svg onload="x"></svg>').digest('hex'), count: 1, index: 0, content: Buffer.from('<svg onload="x"></svg>').toString('base64') }, git, 'test-secret'));

  // Live type in the editor's presentation mode vs published outlines in the public viewer.
  await page.click('.card:first-child .thumbnail');
  await button('발표');
  await page.waitForSelector('.presentation .text-body');
  await page.evaluate(() => document.fonts.ready);
  const hideControls = () => page.addStyleTag({ content: '.present-controls{display:none!important}' });
  await hideControls(); await new Promise(r => setTimeout(r, 300)); // before its 1.5 s auto-advance
  assert.ok(await page.$('.presentation .text-body'), 'still on the text slide');
  const live = await page.screenshot({ encoding: 'base64' });
  await page.keyboard.press('Escape');
  await page.click('.card:last-child .thumbnail');
  await button('발표');
  await page.waitForSelector('.presentation .text-body');
  await page.evaluate(() => document.fonts.ready);
  await hideControls(); await new Promise(r => setTimeout(r, 300));
  const boldLive = await page.screenshot({ encoding: 'base64' });
  fs.writeFileSync(path.join(out, 'bold-live.png'), Buffer.from(boldLive, 'base64'));
  await page.keyboard.press('Escape');
  stripAdvance = true;
  await page.goto(base + '261103-yun/');
  await page.waitForFunction(() => { const i = document.querySelector('.presentation img.capture-preview'); return i?.complete && i.naturalWidth; });
  assert.equal(await page.$('.presentation .text-body'), null, 'public view never sets live type');
  await hideControls();
  const outlined = await page.screenshot({ encoding: 'base64' });
  fs.writeFileSync(path.join(out, 'text-live.png'), Buffer.from(live, 'base64'));
  fs.writeFileSync(path.join(out, 'text-svg.png'), Buffer.from(outlined, 'base64'));
  const compare = (a, b) => page.evaluate(async (a, b) => {
    const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
    const [x, y] = await Promise.all([load(a), load(b)]);
    const c = document.createElement('canvas'); c.width = x.width; c.height = x.height; const g = c.getContext('2d');
    g.drawImage(x, 0, 0); const p = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(y, 0, 0); const q = g.getImageData(0, 0, c.width, c.height).data;
    let ink = 0, off = 0, sum = 0;
    for (let i = 0; i < p.length; i += 4) { const d = Math.abs(p[i] - q[i]); sum += d; if (p[i] > 128) ink++; if (d > 128) off++; }
    return { ink, off, mean: sum / (p.length / 4) };
  }, a, b);
  const diff = await compare(live, outlined);
  console.log('text live vs svg', diff);
  assert.ok(diff.ink > 5000, 'text was drawn');
  assert.ok(diff.off / diff.ink < 0.03, `SVG outlines match live type (${diff.off} of ${diff.ink} ink pixels differ strongly)`);

  // Public playback: text advances itself, sequence flips two at a time then moves on, clip moves on.
  stripAdvance = false;
  await page.goto(base + '261103-yun/');
  await page.waitForSelector('.presentation');
  const position = () => page.$eval('.present-controls span', e => e.textContent.trim());
  await page.waitForFunction(() => document.querySelector('.present-controls span')?.textContent.trim() === '2 / 5', { timeout: 5000 });
  // Fade starts once the incoming step is decoded.
  await page.waitForFunction(() => document.getAnimations().some(a => a.effect?.target?.classList?.contains('presentation-layer')), { timeout: 3000 });
  const steps = new Set();
  for (let i = 0; i < 6; i++) { steps.add(await page.evaluate(() => [...document.querySelectorAll('.presentation .sequence-step')].find(s => s.style.visibility === 'visible')?.textContent + [...document.querySelectorAll('.presentation .sequence-step')].filter(s => s.style.visibility === 'visible').map(s => s.querySelectorAll('img').length).join())); await new Promise(r => setTimeout(r, 150)); }
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('.presentation .sequence-step')].every(s => s.querySelectorAll('img').length <= 2)), 'two images per step');
  await page.waitForFunction(() => document.querySelector('.present-controls span')?.textContent.trim() === '3 / 5', { timeout: 5000 });
  await page.waitForSelector('.presentation video.local-video');
  await page.waitForFunction(() => document.querySelector('.present-controls span')?.textContent.trim() === '4 / 5', { timeout: 8000 });
  await page.waitForSelector('.presentation .browser-window');
  await page.screenshot({ path: path.join(out, 'public-web.png') });
  assert.equal(await position(), '4 / 5');
  // Bold slide: live type vs outlines. Positions match; glyph shapes differ only by the 장평 the editor cannot apply.
  await page.keyboard.press('End');
  await page.waitForFunction(() => { const i = document.querySelector('.presentation-layer[aria-hidden="false"] img.capture-preview'); return i?.complete && i.naturalWidth; });
  await hideControls();
  const boldOutlined = await page.screenshot({ encoding: 'base64' });
  fs.writeFileSync(path.join(out, 'bold-svg.png'), Buffer.from(boldOutlined, 'base64'));
  // Finder-style drop of loose images onto the slide list becomes one sequence after the selection.
  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  const before = await page.$$eval('.card', c => c.length);
  await page.evaluate(async () => {
    const dt = new DataTransfer();
    for (const [i, color] of ['#f00', '#0f0', '#00f'].entries()) {
      const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 320, 180);
      dt.items.add(new File([await new Promise(r => c.toBlob(r, 'image/png'))], `drop-${i + 1}.png`, { type: 'image/png' }));
    }
    document.querySelector('.workspace').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(n => document.querySelectorAll('.card').length === n + 1, { timeout: 10000 }, before);
  await ready();
  assert.equal(await page.$eval('.card.selected .card-title', e => e.textContent), 'drop-1');
  assert.equal(await page.$$eval('.card.selected .photo-placement img', i => i.length), 1, 'dropped images became a one-at-a-time sequence');
  const boldDiff = await compare(boldLive, boldOutlined);
  console.log('bold live vs svg', boldDiff);
  assert.ok(boldDiff.ink > 5000 && boldDiff.off / boldDiff.ink < 0.2, 'bold outlines sit where the editor set them');
  assert.deepEqual(errors, []);
  console.log('PASS: text/sequence/clip/browser-frame edit → save → publish (SVG allowlist, mp4) → public outlines match live type → auto-advance, 2-up sequence, dissolve, clip end → next → dropped images become a sequence');
  console.log('screenshots in', out);
} finally { await browser.close(); }
