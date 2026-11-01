// 판형 and optical margins: a 4:3 presentation with text slides whose first-line ink must sit exactly on
// equal top and left margins, in the editor's live type and in the published SVG outlines (mock GitHub).
// Needs the dev server on 3100, Google Chrome and the composite fonts in ~/Library/Fonts and /Library/Fonts.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
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
const fonts = {
  'SM3SJGothic-03': userFont('SM3신중고딕-03.otf'), 'SFProDisplay-Regular': fs.readFileSync('/Library/Fonts/SF-Pro-Display-Regular.otf'),
  'SM3KGothic-Regular': userFont('SM3견출고딕-Regular.otf'), 'Pretendard-Bold': userFont('Pretendard-Bold.otf'),
  'SuisseIntl-SemiBold': userFont('SuisseIntl-SemiBold.otf'), 'SuisseIntl-SemiBoldItalic': userFont('SuisseIntl-SemiBoldItalic.otf'),
};
const out = process.env.VERIFY_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'verify-text-format-'));
// The first line's letters set the top; the leftmost line-start glyph sets the left.
const cases = [
  { text: '김재연, 동작하는 것', size: 96, margin: 96 },
  { text: 'Visual Engineering', size: 120, margin: 64 },
  { text: '시각 공학 디자인', size: 160, margin: 120, bold: true },
  // Quotes and brackets overshoot: they start the left margin, but the letters inside set the top.
  { text: '“낯선 접점” 졸업작품', size: 96, margin: 96, letters: [160, 330], overshoots: true },
  { text: '(PWD.SIDI) 참여', size: 96, margin: 96, letters: [140, 600] },
  // “1” has a wide left side bearing: the line below it, not the digit, meets the margin.
  { text: '1\n자기소개', size: 96, margin: 96, bold: true },
  { text: '**어떤 학생이었나**\n(작성 예정)\n\n지금은 keep-all로 줄을 바꾸는 긴 문단이 오른쪽 여백에서 넘어가는지 보는 문장입니다.', size: 48, margin: 96 },
];

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
    if (url.pathname.endsWith('/api/publish/')) {
      try { return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(await executePublish(JSON.parse(req.postData()), git, 'test-secret')) }); }
      catch (e) { return req.respond({ status: e.status || 500, contentType: 'application/json', body: JSON.stringify({ error: e.message }) }); }
    }
    if (url.pathname.startsWith(`/presentations/decks/${ID}/`)) {
      const file = files.get('public/' + url.pathname.slice('/presentations/'.length));
      return req.respond(file ? { status: 200, contentType: url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: file } : { status: 404, body: '{}' });
    }
    return req.continue();
  });
  const button = async (label, scope = '') => {
    await page.waitForFunction((label, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled && !b.closest('[inert]')), { timeout: 30000 }, label, scope);
    await page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label).click(), label, scope);
  };
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const field = async (label, value, scope = '.properties') => {
    const handle = await page.evaluateHandle((label, scope) => [...document.querySelectorAll(scope + ' label')].find(l => l.textContent.trim().startsWith(label))?.querySelector('input,select'), label, scope);
    if (await handle.evaluate(e => e.tagName) === 'SELECT') await handle.select(value);
    else { await handle.evaluate(e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await handle.type(String(value)); }
    assert.equal(String(await handle.evaluate(e => e.value)), String(value), label);
  };
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 60000 }, text);
  // Ink box of an image (PNG data or a URL) in sheet px: first rows/columns with a bright pixel.
  const inkBox = (src, sheet, letters = [0, 1e9]) => page.evaluate(async (src, sheet, [from, to]) => {
    const image = new Image(); image.src = src; await image.decode();
    const crop = sheet || { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    const c = document.createElement('canvas'); c.width = crop.width; c.height = crop.height;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    const d = g.getImageData(0, 0, c.width, c.height).data, scale = 1920 / crop.width;
    let top = Infinity, left = Infinity, overshoot = Infinity;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4] > 96) {
      left = Math.min(left, x); overshoot = Math.min(overshoot, y);
      if (x * scale >= from && x * scale <= to) top = Math.min(top, y);
    }
    return { top: top * scale, left: left * scale, overshoot: overshoot * scale };
  }, src, sheet, letters);

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar');
  await ready();
  for (const [name, bytes] of Object.entries(fonts)) await page.evaluate(async (name, b64) => {
    const cache = await caches.open('presentation-fonts-v1');
    await cache.put(new Request(new URL('/presentation-fonts/' + name, location.origin)), new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
  }, name, bytes.toString('base64'));
  await page.reload();
  await page.waitForSelector('.toolbar');
  await ready();
  assert.equal(await page.$$eval('.card', c => c.length), 0, '11/3 deck starts empty');
  await field('판형', '4:3', '.toolbar');

  for (const [i, c] of cases.entries()) {
    await button('추가', '.toolbar'); await button('텍스트');
    await page.waitForFunction(n => document.querySelectorAll('.card').length === n, {}, i + 1);
    await page.type('.text-editor', c.text);
    await field('글꼴', c.bold ? 'bold' : 'regular');
    await field('크기', c.size);
    await field('위·왼쪽', c.margin);
  }
  const typos = await page.evaluate(() => [...document.querySelectorAll('.card')].length);
  assert.equal(typos, cases.length);
  // A new text slide continues the previous one's type.
  await button('추가', '.toolbar'); await button('텍스트');
  assert.equal(await page.$eval('.properties label:has(select) select', s => s.value), cases.at(-1).bold ? 'bold' : 'regular');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('크기')).querySelector('input').value), String(cases.at(-1).size));
  await button('삭제', '.properties');
  await page.waitForFunction(n => document.querySelectorAll('.card').length === n, {}, cases.length);
  assert.ok(Math.abs(await page.$eval('.preview .slide-sheet', e => { const r = e.getBoundingClientRect(); return r.width / r.height; }) - 4 / 3) < 0.005, 'preview sheet is 4:3');
  // The editor's boxes take the 판형, so the sheet fills them and its edges are the box's edges.
  for (const box of ['.preview', '.card .thumbnail']) assert.ok(Math.abs(await page.$eval(box, e => { const r = e.getBoundingClientRect(); return r.width / r.height; }) - 4 / 3) < 0.01, box + ' is 4:3');
  // Margin guides sit on the margins (last case: 96 on a 1440-high sheet).
  const guides = await page.$eval('.preview', box => {
    const sheet = box.querySelector('.slide-sheet').getBoundingClientRect(), unit = sheet.width / 1920;
    return [...box.querySelectorAll('.margin-guides i')].map((g, i) => { const r = g.getBoundingClientRect(); return Math.round((i ? r.left - sheet.left : r.top - sheet.top) / unit); });
  });
  assert.deepEqual(guides, [96, 96, 1920 - 96], 'top, left and right guides');

  await button('저장'); await status('이 브라우저에 저장됨');
  await page.reload(); await page.waitForSelector('.toolbar'); await ready();
  assert.equal(await page.$eval('.toolbar .format select', s => s.value), '4:3', '판형 is saved with the deck');
  await button('게시'); await status('게시됨');
  const deck = JSON.parse(files.get(`public/decks/${ID}/deck.json`));
  assert.equal(deck.format, '4:3');
  assert.equal(deck.slides[2].typo.composite, 'bold');

  const results = [];
  for (const [i, c] of cases.entries()) {
    const svg = files.get('public/' + deck.assets[deck.slides[i].previewId].slice('/presentations/'.length));
    assert.ok(safeSvg(svg));
    assert.match(svg.toString(), /viewBox="0 0 1920 1440" width="1920" height="1440"/);
    const outline = await inkBox('data:image/svg+xml;base64,' + svg.toString('base64'), undefined, c.letters);
    // Live type in presentation mode: the 4:3 sheet sits pillarboxed in the 1920×1080 screen.
    await page.click(`.card:nth-child(${i + 1}) .thumbnail`);
    await button('발표');
    await page.waitForSelector('.presentation .text-body');
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '.present-controls{display:none!important}' });
    await new Promise(r => setTimeout(r, 200));
    const sheet = await page.$eval('.presentation .slide-sheet', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    const shot = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(path.join(out, `live-${i}.png`), Buffer.from(shot, 'base64'));
    const live = await inkBox('data:image/png;base64,' + shot, sheet, c.letters);
    await page.keyboard.press('Escape');
    results.push({ text: c.text, margin: c.margin, svg: [outline.top, outline.left].map(v => +v.toFixed(1)), live: [live.top, live.left].map(v => +v.toFixed(1)), overshoot: +outline.overshoot.toFixed(1) });
    if (c.overshoots) assert.ok(outline.overshoot < c.margin - 2, 'the quote rises above the letters');
    // Antialiased edges: within 1 sheet px in the outlines, 1 screen px (1.33 sheet px) live.
    assert.ok(Math.abs(outline.top - c.margin) <= 1 && Math.abs(outline.left - c.margin) <= 1, `outline ink at the margins: ${JSON.stringify(results.at(-1))}`);
    assert.ok(Math.abs(live.top - c.margin) <= 2 && Math.abs(live.left - c.margin) <= 2, `live ink at the margins: ${JSON.stringify(results.at(-1))}`);
  }
  console.table(results);

  // PDF pages follow the 판형 (320mm wide).
  await page.evaluate(() => { window.print = () => { window.__printed = document.querySelector('.print-deck style')?.textContent; }; });
  await button('PDF');
  await page.waitForFunction(() => window.__printed !== undefined, { timeout: 30000 });
  assert.match(await page.evaluate(() => window.__printed), /size:320mm 240\.00mm/);
  assert.deepEqual(errors, []);
  console.log('text margins and 판형 verified ·', out);
} finally {
  await browser.close();
}
