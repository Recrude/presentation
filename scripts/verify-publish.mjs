// Publishing sends each file once and only what the site lacks: the first publish puts every file up, three at a
// time (a video over 2 MB in chunks, then assembled); publishing again unchanged sends nothing but deck.json, and a
// changed text slide sends only its new outline. A GitHub rate limit (429 with its wait) is sat out and the publish
// carries on. Through the real server checks (mock GitHub, each request held 150 ms); the site answers HEAD for
// what has been published. Needs the dev server on 3100, Google Chrome and the composite fonts in
// ~/Library/Fonts and /Library/Fonts; the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { executePublish } from '../server/publish.ts';
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
const material = new URL('../../261103-yun/', import.meta.url).pathname;
const imageDir = material + 'portfolio-images/2025.12-audio-morphology/';
const images = fs.readdirSync(imageDir).filter(n => n.endsWith('.webp')).sort().slice(0, 9).map(n => imageDir + n);
const clip = material + 'instagram-B4IWh8EHPvK/10.mp4';
assert.ok(fs.statSync(clip).size > 2 * 1024 * 1024, 'the clip goes up in chunks');
const registry = { version: 1, items: catalogEntries.map(e => ({ id: e.id, public: true })) };
const blobs = new Map(), published = new Map();
let pending = [];
const git = async (p, method = 'GET', body) => {
  if (p.startsWith('contents/public/decks/catalog.json?ref=')) return { content: Buffer.from(JSON.stringify(registry)).toString('base64') };
  if (p === 'git/blobs' && method === 'POST') { const b = Buffer.from(body.content, 'base64'), sha = createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'); blobs.set(sha, b); return { sha }; }
  if (p.startsWith('git/blobs/')) return { encoding: 'base64', content: blobs.get(p.split('/').pop()).toString('base64') };
  if (p === 'git/ref/heads/main') return { object: { sha: 'a'.repeat(40) } };
  if (p === 'git/commits/' + 'a'.repeat(40)) return { tree: { sha: 'b'.repeat(40) } };
  if (p === 'git/trees') { pending = body.tree; return { sha: 'c'.repeat(40) }; }
  if (p === 'git/commits') return { sha: 'd'.repeat(40) };
  if (p === 'git/refs/heads/main') { for (const t of pending) published.set(t.path, t.content !== undefined ? Buffer.from(t.content) : blobs.get(t.sha)); return {}; }
  throw Error('Unexpected Git request ' + p);
};
const types = { json: 'application/json', svg: 'image/svg+xml', webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png', mp4: 'video/mp4' };
const pause = ms => new Promise(r => setTimeout(r, ms));
// Requests to the publish API in the current run, the most at once, and a rate limit to answer next.
let calls = [], flying = 0, most = 0, limit = 0;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', async req => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/decks/catalog.json')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(registry) });
    if (url.pathname.endsWith('/api/publish/')) {
      const input = JSON.parse(req.postData());
      calls.push(input.action);
      if (input.action === 'upload' && limit) { limit--; return req.respond({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: '게시 요청이 잠시 제한되었습니다. 잠시 후 다시 시도하세요.', retryAfter: 1 }) }); }
      flying++; most = Math.max(most, flying);
      try { await pause(150); return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(await executePublish(input, git, 'test-secret')) }); }
      catch (e) { return req.respond({ status: e.status || 500, contentType: 'application/json', body: JSON.stringify({ error: e.message }) }); }
      finally { flying--; }
    }
    if (url.pathname.startsWith(`/presentations/decks/${ID}/`)) {
      const file = published.get('public/' + url.pathname.slice('/presentations/'.length));
      return req.respond(file ? { status: 200, contentType: types[url.pathname.split('.').pop()] || 'application/octet-stream', body: file } : { status: 404, contentType: 'text/plain', body: 'not found' });
    }
    return req.continue();
  });
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const button = async (label, scope = '') => {
    await page.waitForFunction((label, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled && !b.closest('[inert]')), { timeout: 30000 }, label, scope);
    await page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled).click(), label, scope);
  };
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 120000 }, text);
  const select = n => page.evaluate(n => document.querySelectorAll('.card .card-title')[n].click(), n);
  // Publish and answer what went up: the requests by action, the most at once, the statuses shown and the time.
  const publish = async () => {
    calls = []; most = 0;
    await page.evaluate(() => { window.statuses = []; });
    const start = Date.now();
    await button('게시', '.toolbar'); await status('게시됨');
    const shown = await page.evaluate(() => [...window.statuses, document.querySelector('[role=status]').textContent]);
    const count = action => calls.filter(a => a === action).length;
    return { upload: count('upload'), assemble: count('assemble'), deck: count('deck'), most, shown, final: shown.at(-1), seconds: (Date.now() - start) / 1000 };
  };
  const deckJson = () => JSON.parse(published.get(`public/decks/${ID}/deck.json`));

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar');
  for (const [name, bytes] of Object.entries(fonts)) await page.evaluate(async (name, b64) => {
    const cache = await caches.open('presentation-fonts-v1');
    await cache.put(new Request(new URL('/presentation-fonts/' + name, location.origin)), new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
  }, name, bytes.toString('base64'));
  await page.reload();
  await page.waitForSelector('.toolbar'); await ready();
  // Every status the editor shows, kept for the checks.
  await page.evaluate(() => new MutationObserver(() => window.statuses?.push(document.querySelector('[role=status]').textContent)).observe(document.querySelector('[role=status]'), { childList: true, subtree: true, characterData: true }));

  // A sequence of 9 images, a clip over 2 MB and two text slides.
  await button('추가', '.toolbar');
  let [chooser] = await Promise.all([page.waitForFileChooser(), button('시퀀스')]);
  await chooser.accept(images);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 1); await ready();
  await button('추가', '.toolbar');
  [chooser] = await Promise.all([page.waitForFileChooser(), button('클립')]);
  await chooser.accept([clip]);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 2, { timeout: 60000 }); await ready();
  for (const text of ['김재연 동작하는 것\n\nVisual Engineering', 'Seoul 2026 · 다음 장표']) {
    await button('추가', '.toolbar'); await button('텍스트');
    await page.waitForSelector('.text-editor');
    await page.focus('.text-editor');
    await page.keyboard.type(text);
  }
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 4);

  // First publish: every file once (9 images, the clip and its poster, 2 outlines), three at a time.
  const first = await publish();
  const deck = deckJson(), files = new Set(Object.values(deck.assets));
  assert.equal(files.size, 13, '9 images, the clip, its poster and 2 outlines');
  for (const file of files) assert.ok(published.has('public/' + file.slice('/presentations/'.length)), `${file} is in the commit`);
  assert.equal(first.upload, 12 + 2, '12 files in one piece, the clip in two chunks');
  assert.equal(first.assemble, 1, 'the clip assembled');
  assert.equal(first.most, 3, 'three requests at once');
  assert.match(first.final, /^게시됨 · 새 파일 13개 · /);
  assert.ok(first.shown.some(s => /^파일 게시 \d+\/13$/.test(s)), `files counted out of 13: ${JSON.stringify([...new Set(first.shown)])}`);

  // Unchanged: nothing goes up, deck.json keeps every file where it is.
  const again = await publish();
  assert.deepEqual([again.upload, again.assemble, again.deck], [0, 0, 1], 'only deck.json');
  assert.match(again.final, /^게시됨 · 새 파일 0개 · /);
  // (Text outlines are made afresh for each publish, under new ids; their files are the same.)
  assert.deepEqual(new Set(Object.values(deckJson().assets)), files, 'the same files');

  // A changed text slide sends only its new outline.
  await select(3);
  await page.waitForSelector('.text-editor'); await page.focus('.text-editor');
  await page.keyboard.press('End'); await page.keyboard.type(' 끝');
  const edited = await publish();
  assert.deepEqual([edited.upload, edited.assemble], [1, 0], 'one outline');
  assert.match(edited.final, /^게시됨 · 새 파일 1개 · /);
  const now = new Set(Object.values(deckJson().assets));
  assert.deepEqual([[...now].filter(f => !files.has(f)).length, [...files].filter(f => !now.has(f)).length], [1, 1], 'one outline file replaced');

  // A rate limit on the next upload: the editor says it waits, then carries on and publishes.
  await page.focus('.text-editor'); await page.keyboard.type('!');
  limit = 1;
  const limited = await publish();
  assert.equal(limit, 0, 'the limit was met');
  assert.ok(limited.shown.some(s => s === 'GitHub 요청 제한 · 1초 뒤 이어서 올립니다'), 'it says it waits');
  assert.deepEqual([limited.upload, limited.final.startsWith('게시됨 · 새 파일 1개')], [2, true], 'the outline went up after the wait');
  assert.ok(limited.seconds >= 1, 'it waited');
  assert.deepEqual(errors, []);
  console.log(`publish: first 13 files (14 chunks + 1 assemble, 3 at once) in ${first.seconds.toFixed(1)}s; unchanged → 0 files in ${again.seconds.toFixed(1)}s; one text edit → 1 file in ${edited.seconds.toFixed(1)}s; a 429 waits 1s and carries on (${limited.seconds.toFixed(1)}s)`);
} finally { await browser.close(); }
