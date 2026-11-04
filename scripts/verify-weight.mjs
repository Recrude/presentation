// Bold and regular in one text slide: letters picked in the text field turn regular or bold (buttons and
// ⌘B), the field keeps them picked, the slide's 글꼴 follows (bold only when every letter is), undo goes
// back, the preview sets each run in its composite, and the published outlines draw both weights.
// Needs the dev server on 3100, Google Chrome and the composite fonts in ~/Library/Fonts and /Library/Fonts;
// the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { executePublish, safeSvg } from '../server/publish.ts';
import { catalogEntries } from '../app/catalog.ts';
import { FONTS, runStyles } from '../app/composite.ts';
const base = 'http://127.0.0.1:3100/presentations/';
const ID = '2026-11-03-yoon-jaeyoung-graduation-project';
const fontDir = path.join(os.homedir(), 'Library/Fonts');
const userFont = name => fs.readFileSync(path.join(fontDir, fs.readdirSync(fontDir).find(n => n.normalize('NFC') === name)));
const fonts = {
  'SM3SJGothic-03': userFont('SM3신중고딕-03.otf'), 'SFProDisplay-Regular': fs.readFileSync('/Library/Fonts/SF-Pro-Display-Regular.otf'),
  'SM3KGothic-Regular': userFont('SM3견출고딕-Regular.otf'), 'Pretendard-Bold': userFont('Pretendard-Bold.otf'),
  'SuisseIntl-SemiBold': userFont('SuisseIntl-SemiBold.otf'), 'SuisseIntl-SemiBoldItalic': userFont('SuisseIntl-SemiBoldItalic.otf'),
};
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
      try { return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(await executePublish(JSON.parse(req.postData()), git, 'test-secret')) }); }
      catch (e) { return req.respond({ status: e.status || 500, contentType: 'application/json', body: JSON.stringify({ error: e.message }) }); }
    }
    if (url.pathname.startsWith(`/presentations/decks/${ID}/`)) {
      const file = files.get('public/' + url.pathname.slice('/presentations/'.length));
      return req.respond(file ? { status: 200, contentType: url.pathname.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: file } : { status: 404, body: '{}' });
    }
    return req.continue();
  });
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const button = async (label, scope = '') => {
    await page.waitForFunction((label, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled && !b.closest('[inert]')), { timeout: 30000 }, label, scope);
    await page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled).click(), label, scope);
  };
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 60000 }, text);
  // The field, what is picked in it, the slide's 글꼴, and the preview's runs (bold ones in [ ]).
  const state = () => page.evaluate(bold => {
    const t = document.querySelector('.text-editor'), font = [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('글꼴')).querySelector('select').value;
    const runs = [...document.querySelectorAll('.preview .text-body p')].map(p => [...p.querySelectorAll('[data-run]')].map(s => bold.includes(Number(s.dataset.run)) ? `[${s.textContent}]` : s.textContent).join('').replace(/\]\[/g, '')).join(' ¶ ');
    return { value: t.value, picked: t.value.slice(t.selectionStart, t.selectionEnd), focused: document.activeElement === t, font, runs };
  }, runStyles.flatMap((s, i) => s.bold ? [i] : []));
  // Picks from the first `from` to the end of the first `to` after it, as a drag in the field would.
  const pick = (from, to = from) => page.evaluate((from, to) => {
    const t = document.querySelector('.text-editor'), at = t.value.indexOf(from), end = t.value.indexOf(to, at) + to.length;
    if (at < 0 || end < at + to.length) throw Error('not in the field: ' + from);
    t.focus(); t.setSelectionRange(at, end);
  }, from, to);
  const next = () => new Promise(r => setTimeout(r, 150));

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  for (const [name, bytes] of Object.entries(fonts)) await page.evaluate(async (name, b64) => {
    const cache = await caches.open('presentation-fonts-v1');
    await cache.put(new Request(new URL('/presentation-fonts/' + name, location.origin)), new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
  }, name, bytes.toString('base64'));
  await page.reload();
  await page.waitForSelector('.toolbar'); await ready();
  assert.equal(await page.$$eval('.card', c => c.length), 0, '11/3 deck starts empty');
  await button('추가', '.toolbar'); await button('텍스트');
  await page.waitForSelector('.text-editor');
  await page.type('.text-editor', '김재연 동작하는 것\n\nVisual Engineering');
  let s = await state();
  assert.deepEqual([s.font, s.runs], ['bold', '[김재연 동작하는 것] ¶ [Visual Engineering]'], 'a new text slide is bold throughout');

  // 레귤러 on a picked word of a bold slide: the base turns regular, the rest is marked bold.
  await pick('동작');
  await button('레귤러', '.properties'); await next();
  s = await state();
  assert.deepEqual(s, { value: '**김재연** 동작**하는 것**\n\n**Visual Engineering**', picked: '동작', focused: true, font: 'regular', runs: '[김재연] 동작[하는 것] ¶ [Visual Engineering]' });
  // ⌘B on it: every letter bold again, so the slide is bold without marks.
  await page.keyboard.down('Meta'); await page.keyboard.press('b'); await page.keyboard.up('Meta'); await next();
  s = await state();
  assert.deepEqual([s.value, s.picked, s.font, s.runs], ['김재연 동작하는 것\n\nVisual Engineering', '동작', 'bold', '[김재연 동작하는 것] ¶ [Visual Engineering]'], '⌘B: the other weight');
  // Undo goes back to the mixed slide.
  await button('되돌리기', '.toolbar'); await next();
  s = await state();
  assert.deepEqual([s.font, s.runs], ['regular', '[김재연] 동작[하는 것] ¶ [Visual Engineering]'], 'undo');
  // 볼드 / 레귤러 across the paragraphs: the runs close at the paragraph's end and reopen.
  await pick('것', 'Visual');
  await button('레귤러', '.properties'); await next();
  s = await state();
  assert.deepEqual([s.value, s.picked, s.runs], ['**김재연** 동작**하는** 것\n\nVisual **Engineering**', '것\n\nVisual', '[김재연] 동작[하는] 것 ¶ Visual [Engineering]'], 'runs close at the paragraph’s end and reopen');
  await pick('Engineering');
  await button('레귤러', '.properties'); await next();
  await pick('Visual');
  await button('볼드', '.properties'); await next();
  s = await state();
  assert.deepEqual([s.value, s.picked], ['**김재연** 동작**하는** 것\n\n**Visual** Engineering', 'Visual']);
  // Nothing to set when no letter is picked.
  await page.evaluate(() => { const t = document.querySelector('.text-editor'); t.focus(); t.setSelectionRange(3, 3); });
  await button('볼드', '.properties');
  await status('굵기를 바꿀 글자를 고르세요');
  assert.equal((await state()).value, '**김재연** 동작**하는** 것\n\n**Visual** Engineering');

  if (process.env.VERIFY_OUT) for (const scope of ['.properties', '.preview']) await (await page.$(scope)).screenshot({ path: `${process.env.VERIFY_OUT}/weight${scope.replace('.', '-')}.png` });
  // The outlines draw each run in its face: regular Hangul in 신중고딕, bold in 견출고딕, Latin in SF Pro and Suisse.
  await button('저장', '.toolbar'); await status('이 브라우저에 저장됨');
  await button('게시', '.toolbar'); await status('게시됨');
  const deck = JSON.parse(files.get(`public/decks/${ID}/deck.json`));
  const [slide] = deck.slides;
  assert.equal(slide.typo.composite, undefined, 'published on a regular base');
  const svg = files.get('public/' + deck.assets[slide.previewId].slice('/presentations/'.length));
  assert.ok(safeSvg(svg));
  const uses = Object.fromEntries(FONTS.map((font, i) => [font, (svg.toString().match(new RegExp(`href="#f${i}g`, 'g')) || []).length]));
  assert.equal(uses['SM3SJGothic-03'], 3, 'regular Hangul: 동작것');
  assert.equal(uses['SM3KGothic-Regular'], 5, 'bold Hangul: 김재연하는');
  assert.equal(uses['SFProDisplay-Regular'], 'Engineering'.length, 'regular Latin');
  assert.equal(uses['SuisseIntl-SemiBold'], 'Visual'.length, 'bold Latin');
  assert.deepEqual(errors, []);
  console.log(`weight: picked letters go regular/bold (buttons and ⌘B), stay picked, the slide's 글꼴 follows (bold when every letter is), undo, runs close at paragraph ends; outlines use ${JSON.stringify(uses)}`);
} finally {
  await browser.close();
}
