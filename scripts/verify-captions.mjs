// Captions under images and web pages: a row's 캡션 opens its field, typed lines (at most 4) become small type under the
// image, and the grid or sequence keeps room for the longest under every image, so images keep one size
// from step to step. Measured on screen in the presentation (sheet px at 1:1): the caption's ink starts
// 12 px under its image and lines up with its left edge, centre or right edge (캡션 정렬). Published
// through the real checks (mock GitHub) as SVG outlines per slide (a copy of the slide gets its own),
// which the public viewer shows in the same places as the live type. A web page's caption goes under its
// Safari window or under the page inside the slide's margin, which shrink by its room.
// Needs the dev server on 3100, Google Chrome, ffmpeg and the composite fonts in ~/Library/Fonts and
// /Library/Fonts; the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { executePublish, safeSvg } from '../server/publish.ts';
import { catalogEntries } from '../app/catalog.ts';
const base = 'http://127.0.0.1:3100/presentations/';
const ID = '2026-11-03-yoon-jaeyoung-graduation-project';
const fontDir = path.join(os.homedir(), 'Library/Fonts');
const userFont = name => fs.readFileSync(path.join(fontDir, fs.readdirSync(fontDir).find(n => n.normalize('NFC') === name)));
const fonts = { 'SM3SJGothic-03': userFont('SM3신중고딕-03.otf'), 'SFProDisplay-Regular': fs.readFileSync('/Library/Fonts/SF-Pro-Display-Regular.otf') };
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-captions-'));
const seq = path.join(work, 'seq');
fs.mkdirSync(seq);
const image = (name, color, size) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:d=1`, '-frames:v', '1', path.join(seq, name)]);
image('a.png', 'red', '1600x900'); image('b.png', 'green', '900x1200'); image('c.png', 'blue', '1200x900');
// Captures of the web page (answered for the capture API at the size asked) and the page itself.
const captures = [], captured = (w, h) => execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=gray:s=${w}x${h}:d=1`, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-']);
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
  if (p === 'contents/public/decks?ref=main') return []; // nothing published yet
  throw Error('Unexpected Git request ' + p);
};
const types = { json: 'application/json', svg: 'image/svg+xml', png: 'image/png' };

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/decks/catalog.json')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(registry) });
    if (url.pathname.endsWith('/api/capture')) {
      // Asked at the size the slide shows the page: answered as a picture of exactly that size.
      const w = +url.searchParams.get('w'), h = +url.searchParams.get('h');
      captures.push([w, h]);
      return req.respond({ status: 200, contentType: 'image/png', headers: { 'X-Toolbar-Color': '#ffffff' }, body: captured(w, h) });
    }
    if (url.hostname === 'caption.test') return req.respond({ status: 200, contentType: 'text/html', body: '<body style="margin:0;background:#888"></body>' });
    if (url.pathname.endsWith('/api/publish/')) {
      try { return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(await executePublish(JSON.parse(req.postData()), git, 'test-secret')) }); }
      catch (e) { return req.respond({ status: e.status || 500, contentType: 'application/json', body: JSON.stringify({ error: e.message }) }); }
    }
    if (url.pathname.startsWith(`/presentations/decks/${ID}/`)) {
      const file = files.get('public/' + url.pathname.slice('/presentations/'.length));
      return req.respond(file ? { status: 200, contentType: types[url.pathname.split('.').pop()] || 'application/octet-stream', body: file } : { status: 404, body: '{}' });
    }
    return req.continue();
  });
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const button = async (label, scope = '') => {
    await page.waitForFunction((label, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled && !b.closest('[inert]')), { timeout: 30000 }, label, scope);
    await page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled).click(), label, scope);
  };
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 60000 }, text);
  const choose = (label, value) => page.evaluate((label, value) => {
    const s = [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith(label)).querySelector('select');
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, value); s.dispatchEvent(new Event('change', { bubbles: true }));
  }, label, value);
  const setField = (label, value) => page.evaluate((label, value) => {
    const input = [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith(label)).querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, label, value);
  const field = name => page.$(`textarea[aria-label="${name} 캡션"]`);
  const caption = async (name, text) => {
    await page.$eval(`.photo-row button[aria-label="${name} 캡션"]`, b => b.click());
    await page.waitForFunction(name => document.activeElement?.getAttribute('aria-label') === `${name} 캡션`, {}, name);
    await page.keyboard.type(text);
  };
  const select = n => page.evaluate(n => document.querySelectorAll('.card .card-title')[n].click(), n);
  // Image boxes (sheet px) of the slide on screen, the visible step's in a sequence, with their names.
  const placements = (all = false) => page.evaluate(all => {
    const layer = document.querySelector('.presentation-layer[aria-hidden="false"]'), sheet = layer.querySelector('.slide-sheet').getBoundingClientRect(), k = 1920 / sheet.width;
    const steps = layer.querySelectorAll('.sequence-step'), scope = steps.length && !all ? [...steps].find(s => s.style.visibility === 'visible') : layer;
    return [...scope.querySelectorAll('.photo-placement')].map(p => { const r = p.getBoundingClientRect(); return { name: p.querySelector('img').alt, x: (r.x - sheet.x) * k, y: (r.y - sheet.y) * k, width: r.width * k, height: r.height * k }; });
  }, all);
  // The web page's box on screen (its window, or the page inside the margin), in sheet px.
  const pageRect = selector => page.evaluate(selector => {
    const layer = document.querySelector('.presentation-layer[aria-hidden="false"]'), sheet = layer.querySelector('.slide-sheet').getBoundingClientRect(), k = 1920 / sheet.width, r = layer.querySelector(selector).getBoundingClientRect();
    return [{ name: 'page', x: (r.x - sheet.x) * k, y: (r.y - sheet.y) * k, width: r.width * k, height: r.height * k }];
  }, selector);
  // Ink of the bright (caption) pixels on screen under an image box, in sheet px.
  const ink = async box => page.evaluate(async (shot, box) => {
    const sheet = document.querySelector('.presentation-layer[aria-hidden="false"] .slide-sheet').getBoundingClientRect(), k = sheet.width / 1920;
    const image = new Image(); image.src = 'data:image/png;base64,' + shot; await image.decode();
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(image, 0, 0);
    const x0 = Math.round(sheet.x + (box.x - 20) * k), y0 = Math.ceil(sheet.y + (box.y + box.height) * k) + 1, w = Math.round((box.width + 40) * k), h = Math.round(110 * k);
    const d = g.getImageData(x0, y0, w, h).data;
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (Math.min(d[i], d[i + 1], d[i + 2]) > 150) { top = Math.min(top, y); bottom = Math.max(bottom, y + 1); left = Math.min(left, x); right = Math.max(right, x + 1); } }
    const sx = v => (x0 - sheet.x + v) / k, sy = v => (y0 - sheet.y + v) / k;
    return { top: sy(top), bottom: sy(bottom), left: sx(left), right: sx(right) };
  }, await page.screenshot({ encoding: 'base64' }), box);
  const close = (a, b, d, message) => assert.ok(Math.abs(a - b) <= d, `${message}: ${a.toFixed(2)} vs ${b.toFixed(2)}`);
  // Each captioned box's caption: 12 px under it, lined up as asked, inside the bottom margin.
  const measure = async (names, align, label, shown, margin = 64) => {
    const boxes = shown || await placements(), found = {};
    for (const name of names) {
      const box = boxes.find(b => b.name === name), m = await ink(box), at = `${label} ${name} ${align}`;
      assert.ok(m.top < Infinity, `${at}: a caption under the image`);
      close(m.top, box.y + box.height + 12, 1.5, `${at}: ink 12 px under the image`);
      if (align === 'left') close(m.left, box.x, 1.5, `${at}: left edges`);
      if (align === 'center') close((m.left + m.right) / 2, box.x + box.width / 2, 1.5, `${at}: centres`);
      if (align === 'right') close(m.right, box.x + box.width, 2, `${at}: right edges`);
      assert.ok(m.bottom <= 1080 - margin + 1, `${at}: inside the bottom margin (${m.bottom})`);
      found[name] = m;
    }
    return found;
  };
  const present = async () => {
    await button('발표', '.toolbar');
    await page.waitForSelector('.presentation-layer[aria-hidden="false"] .slide-sheet');
    await page.addStyleTag({ content: '.present-controls{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 400));
  };
  const leave = async () => { await page.keyboard.press('Escape'); await page.waitForSelector('.presentation-layer', { hidden: true }); };

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  for (const [name, bytes] of Object.entries(fonts)) await page.evaluate(async (name, b64) => {
    const cache = await caches.open('presentation-fonts-v1');
    await cache.put(new Request(new URL('/presentation-fonts/' + name, location.origin)), new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
  }, name, bytes.toString('base64'));
  await page.reload();
  await page.waitForSelector('.toolbar'); await ready();
  assert.equal(await page.$$eval('.card', c => c.length), 0, '11/3 deck starts empty');
  const client = await page.target().createCDPSession();
  const { x, y } = await page.$eval('.workspace', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  for (const type of ['dragEnter', 'dragOver', 'drop']) await client.send('Input.dispatchDragEvent', { type, x, y, data: { items: [], files: [seq], dragOperationsMask: 1 } });
  await page.waitForSelector('.card'); await ready();

  // A field opens only from its row's 캡션, and closes again while empty.
  assert.equal(await page.$$eval('textarea.caption-field', t => t.length), 0, 'no caption fields at first');
  assert.equal(await page.$$eval('.properties label', l => l.some(x => x.textContent.startsWith('캡션 정렬'))), false, 'no 캡션 정렬 without captions');
  await page.$eval('.photo-row button[aria-label="b.png 캡션"]', b => b.click());
  await page.waitForSelector('textarea[aria-label="b.png 캡션"]');
  await page.$eval('.photo-row button[aria-label="b.png 캡션"]', b => b.click());
  await page.waitForSelector('textarea[aria-label="b.png 캡션"]', { hidden: true });
  // At most four lines; emptied, the caption goes.
  await caption('b.png', '1\n2\n3\n4\n5');
  await status('4줄까지');
  assert.equal(await (await field('b.png')).evaluate(t => t.value), '1\n2\n3\n4\n', 'a fifth line is refused (the empty line before it is no line)');
  await (await field('b.png')).evaluate(t => t.select()); await page.keyboard.press('Backspace');
  await caption('a.png', 'Visual 시각 2025');
  await caption('c.png', '셋째 이미지\n두 줄째');
  assert.equal(await (await field('c.png')).evaluate(t => t.rows), 2, 'the field grows with its lines');
  assert.ok(await page.$$eval('.properties label', l => l.some(x => x.textContent.startsWith('캡션 정렬'))), '캡션 정렬 with captions');
  // The editor's preview sets them as live type.
  assert.equal(await page.$$eval('.preview .text-frame.caption', f => f.length), 1, 'the sequence preview shows the first step’s caption');

  // 격자: both captions in place, each alignment.
  await choose('배열', 'gallery');
  assert.equal(await page.$$eval('.preview .text-frame.caption', f => f.length), 2);
  const live = {};
  for (const align of ['left', 'right', 'center']) {
    await choose('캡션 정렬', align);
    await present();
    live[align] = await measure(['a.png', 'c.png'], align, '격자');
    if (process.env.VERIFY_OUT) await page.screenshot({ path: `${process.env.VERIFY_OUT}/captions-${align}.png` });
    // Two lines take the room: 12 + 18 + 30 under every image.
    const boxes = await placements();
    assert.ok(boxes.every(b => b.y + b.height + 60 <= 1080 - 64 + 0.5), '격자: room for two lines under the images');
    await leave();
  }

  if (process.env.VERIFY_OUT) await (await page.$('.properties')).screenshot({ path: process.env.VERIFY_OUT + '/captions-panel.png' });
  // A copy of the slide, as a sequence: every step keeps the two-line room, so each image is 892 high.
  await button('복제', '.properties');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 2);
  await choose('배열', 'sequence');
  await setField('간격', '10000');
  await choose('캡션 정렬', 'right');
  await select(1);
  await present();
  const steps = await placements(true);
  assert.deepEqual(steps.map(b => b.name), ['a.png', 'b.png', 'c.png'], 'three steps of one image');
  for (const b of steps) close(b.height, 1080 - 128 - 60, 0.5, `${b.name}: one size in every step, with or without a caption`);
  live.sequence = await measure(['a.png'], 'right', '넘김');
  await leave();

  // A web page's caption: under its Safari window (margin 48), which leaves the two-line room.
  await button('추가', '.toolbar');
  await page.type('[aria-label="웹 또는 영상 주소"]', 'https://caption.test/');
  await button('링크 추가');
  await status('캡처 완료');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 3);
  // The page inside the window at margin 48: 1920 − 96 − the 1 px border each side, 1080 − 96 − the 52 px toolbar and border.
  assert.deepEqual(captures.at(-1), [1822, 930], 'captured at the window page size');
  assert.equal(await page.$$eval('.properties label', l => l.some(x => x.textContent.startsWith('캡션 정렬'))), false, 'no 캡션 정렬 before a caption');
  await page.focus('textarea[aria-label="캡션"]');
  await page.keyboard.type('caption.test\n웹 페이지 2026');
  await choose('캡션 정렬', 'right');
  if (process.env.VERIFY_OUT) await (await page.$('.properties')).screenshot({ path: process.env.VERIFY_OUT + '/captions-web-panel.png' });
  await present();
  const framed = await pageRect('.browser-window');
  close(framed[0].y + framed[0].height, 1080 - 48 - 60, 0.5, 'the window ends the two-line room above its 48 margin');
  live.window = await measure(['page'], 'right', '창', framed, 48);
  await leave();
  // A copy without the window, margin 64: under the page itself, centred.
  await button('복제', '.properties');
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 4);
  await page.evaluate(() => [...document.querySelectorAll('.properties label.check')].find(l => l.textContent.includes('브라우저 창')).querySelector('input').click());
  await page.evaluate(() => { const i = document.querySelector('.field input[aria-label="바깥 여백"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '64'); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await choose('캡션 정렬', 'center');
  // After the margin and caption changed, 캡처 갱신 takes the new size (the page inside margin 64, above the
  // two-line caption room) and the picture fills its box uncut.
  await button('캡처 갱신', '.properties');
  await status('캡처 완료');
  assert.deepEqual(captures.at(-1), [1920 - 128, 1080 - 128 - 60], 'captured again at the new page size');
  const fit = await page.$eval('.preview .capture-preview', i => [i.naturalWidth / i.naturalHeight, i.clientWidth / i.clientHeight]);
  close(fit[0], fit[1], 0.005, 'the capture has its box\'s proportions');
  await select(3);
  await present();
  const plain = await pageRect('.slide-inset');
  close(plain[0].y + plain[0].height, 1080 - 64 - 60, 0.5, 'the page ends the two-line room above its 64 margin');
  close(plain[0].x, 64, 0.5, 'the page inside the margin');
  live.page = await measure(['page'], 'center', '페이지', plain, 64);
  if (process.env.VERIFY_OUT) await page.screenshot({ path: `${process.env.VERIFY_OUT}/captions-web.png` });
  await leave();

  // Published through the real checks: outlines per slide, the copy's its own.
  await button('저장', '.toolbar'); await status('이 브라우저에 저장됨');
  await button('게시', '.toolbar'); await status('게시됨');
  const deck = JSON.parse(files.get(`public/decks/${ID}/deck.json`));
  const [grid, sequence, window, bare] = deck.slides;
  assert.deepEqual([grid.kind, grid.captionAlign, sequence.kind, sequence.captionAlign, window.frame, window.captionAlign, bare.frame, bare.captionAlign], ['gallery', 'center', 'sequence', 'right', 'browser', 'right', undefined, 'center']);
  assert.deepEqual(grid.photos.map(p => p.caption), ['Visual 시각 2025', undefined, '셋째 이미지\n두 줄째']);
  assert.deepEqual([window.caption, bare.caption], ['caption.test\n웹 페이지 2026', 'caption.test\n웹 페이지 2026']);
  const outlines = [...grid.photos, ...sequence.photos, window, bare].map(p => p.captionId).filter(Boolean);
  assert.equal(new Set(outlines).size, 6, 'six outlines: each copy has its own');
  for (const id of outlines) {
    const svg = files.get('public/' + deck.assets[id].slice('/presentations/'.length));
    assert.ok(svg && safeSvg(svg) && /viewBox="0 0 1920 1080"/.test(svg.toString()), 'a whole-sheet SVG that passes the server’s checks');
  }

  // The public viewer shows the outlines where the live type was.
  await page.goto(base + '261103-yun/');
  await page.waitForSelector('.presentation-layer[aria-hidden="false"] .caption-outline');
  await page.addStyleTag({ content: '.present-controls{display:none!important}' });
  await page.waitForFunction(() => [...document.querySelectorAll('.presentation-layer[aria-hidden="false"] .caption-outline')].every(i => i.complete && i.naturalWidth));
  assert.equal(await page.$$eval('.presentation-layer[aria-hidden="false"] .caption-outline', i => i.length), 2);
  assert.equal(await page.$$eval('.text-frame.caption', f => f.length), 0, 'no live type in public');
  const outlined = await measure(['a.png', 'c.png'], 'center', '공개 격자');
  for (const name of ['a.png', 'c.png']) for (const side of ['top', 'left', 'right', 'bottom']) close(outlined[name][side], live.center[name][side], 1.5, `공개 ${name} ${side} = live`);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => { const i = document.querySelector('.presentation-layer[aria-hidden="false"] .sequence-step[style*="visible"] .caption-outline'); return i?.complete && i.naturalWidth; });
  await new Promise(r => setTimeout(r, 700));
  const stepped = await measure(['a.png'], 'right', '공개 넘김');
  for (const side of ['top', 'left', 'right', 'bottom']) close(stepped['a.png'][side], live.sequence['a.png'][side], 1.5, `공개 넘김 ${side} = live`);
  for (const [key, selector, align, margin] of [['window', '.browser-window', 'right', 48], ['page', '.slide-inset', 'center', 64]]) {
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(selector => { const layer = document.querySelector('.presentation-layer[aria-hidden="false"]'), i = layer?.querySelector('.caption-outline'); return layer?.querySelector(selector) && i?.complete && i.naturalWidth; }, {}, selector);
    await new Promise(r => setTimeout(r, 700));
    const shown = await measure(['page'], align, `공개 ${key}`, await pageRect(selector), margin);
    for (const side of ['top', 'left', 'right', 'bottom']) close(shown.page[side], live[key].page[side], 1.5, `공개 ${key} ${side} = live`);
  }
  assert.deepEqual(errors, []);
  console.log(`captions: 캡션 opens a field (closes while empty, 4 lines at most, emptied goes); ink 12 px under each image, left/centre/right edges within 1.5 px live and published (${JSON.stringify(Object.fromEntries(Object.entries(outlined['a.png']).map(([k, v]) => [k, +v.toFixed(1)])))}); every step keeps the 2-line room (images 892 high); a web page's caption under its window (right) or the page (centre), live and published; each copy publishes its own outlines`);
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
