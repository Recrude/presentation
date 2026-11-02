// Sequence steps of their own sizes: 한 번에 groups evenly, 묶기/풀기 joins a row to the step above or
// starts a step there. Checks the panel's blocks (a rule above each step), moving and removing rows keeps
// the other steps, 격자 and back keeps them, undo, playback 2·3·1 images per step in the editor and after
// publishing (mock GitHub, real checks), and 한 번에 regrouping everything.
// Needs the dev server on 3100 and Google Chrome; the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { executePublish } from '../server/publish.ts';
import { catalogEntries } from '../app/catalog.ts';
const base = 'http://127.0.0.1:3100/presentations/';
const ID = '2026-11-03-yoon-jaeyoung-graduation-project';
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
const imageDir = new URL('../../261103-yun/portfolio-images/2025.12-audio-morphology/', import.meta.url).pathname;
const images = fs.readdirSync(imageDir).filter(n => n.endsWith('.webp')).sort().slice(0, 6).map(n => imageDir + n);
const names = images.map(f => f.split('/').pop());

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = new URL(req.url());
    if (u.pathname.endsWith('/decks/catalog.json')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(registry) });
    if (u.pathname.endsWith('/api/publish/'))
      return executePublish(JSON.parse(req.postData()), git, 'test-secret').then(r => req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(r) }),
        e => req.respond({ status: e.status || 500, contentType: 'application/json', body: JSON.stringify({ error: e.message }) }));
    if (u.pathname.startsWith(`/presentations/decks/${ID}/`)) {
      const file = published.get('public/' + u.pathname.slice('/presentations/'.length));
      return req.respond(file ? { status: 200, contentType: u.pathname.endsWith('.json') ? 'application/json' : 'image/webp', body: file } : { status: 404, body: '{}' });
    }
    req.continue();
  });
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const button = async (label, scope = '') => {
    await page.waitForFunction((label, scope) => [...document.querySelectorAll(scope + ' button')].some(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled), { timeout: 30000 }, label, scope);
    await page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled).click(), label, scope);
  };
  const row = (name, action) => page.$eval(`.photo-row button[aria-label="${name} ${action}"]`, b => b.click());
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 60000 }, text);
  const setField = (label, value) => page.evaluate((label, value) => {
    const input = [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith(label)).querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, label, value);
  const perFrame = () => page.evaluate(() => { const i = [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith('한 번에')).querySelector('input'); return [i.value, i.placeholder]; });
  // The panel's rows as steps: 'ab cde f' (names by letter), from the rules, and each row's 묶기/풀기.
  const letters = Object.fromEntries(names.map((n, i) => [n, 'abcdef'[i]]));
  const panel = () => page.$$eval('.photo-row', (rows, letters) => {
    let steps = '', labels = '';
    rows.forEach((r, i) => { steps += (i && !r.classList.contains('joined') ? ' ' : '') + letters[r.querySelector('span').textContent]; labels += r.querySelector('button').textContent === '풀기' ? '+' : '·'; });
    return [steps, labels];
  }, letters);
  const assertPanel = async (steps, message) => {
    const [shown, labels] = await panel();
    assert.equal(shown, steps, message);
    assert.equal(labels, [...steps.replace(/ /g, '|')].map((c, i, a) => c === '|' ? '' : i && a[i - 1] !== '|' ? '+' : '·').join(''), `${message}: 풀기 on joined rows`);
  };
  // Image counts of the steps shown, in order, while the slide plays (consecutive repeats dropped).
  const playback = scope => page.evaluate(async scope => {
    const seen = [], end = performance.now() + 2600;
    while (performance.now() < end) {
      const step = [...document.querySelectorAll(scope + ' .sequence-step')].find(s => s.style.visibility === 'visible');
      const shown = step && [...step.querySelectorAll('img')].map(i => i.alt).join(',');
      if (shown && shown !== seen.at(-1)) seen.push(shown);
      await new Promise(r => setTimeout(r, 30));
    }
    return seen;
  }, scope);

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  await button('추가', '.toolbar');
  const [chooser] = await Promise.all([page.waitForFileChooser(), button('시퀀스')]);
  await chooser.accept(images);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 1); await ready();
  await setField('간격', '400');
  await assertPanel('a b c d e f', 'one image per step');
  assert.ok(await page.$eval(`.photo-row button[aria-label="${names[0]} 앞 순번과 묶기"]`, b => b.disabled), 'the first row has no step before it');

  // 한 번에 2, then join e's step to c's and split before f: 2 · 3 · 1.
  await setField('한 번에', '2');
  await assertPanel('ab cd ef', '한 번에 2');
  await row(names[4], '앞 순번과 묶기');
  await assertPanel('ab cdef', 'e joined to the step above');
  await row(names[5], '여기서 순번 나누기');
  await assertPanel('ab cde f', 'split before f');
  assert.deepEqual(await perFrame(), ['', '—'], '한 번에 is empty while steps are of their own sizes');
  // The card shows the first step.
  assert.equal(await page.$$eval('.card .photo-placement img', i => i.length), 2);

  // Moving a row swaps it into the other's place; the steps stay.
  await row(names[1], '뒤로');
  assert.equal((await panel())[0], 'ac bde f', 'b and c swapped places, the steps stayed');
  await row(names[1], '앞으로');
  await assertPanel('ab cde f', 'and back');
  // Removing a row shrinks its step; undo brings it back.
  await row(names[3], '삭제');
  await assertPanel('ab ce f', 'd removed from its step');
  await button('되돌리기');
  await assertPanel('ab cde f', 'undo');
  // 격자 and back keeps the steps.
  await page.evaluate(() => { const s = [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('배열')).querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'gallery'); s.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.equal(await page.$$eval('.photo-row button', b => b.filter(x => ['묶기', '풀기'].includes(x.textContent)).length), 0, '격자 has no steps');
  await page.evaluate(() => { const s = [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('배열')).querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'sequence'); s.dispatchEvent(new Event('change', { bubbles: true })); });
  await assertPanel('ab cde f', '넘김 again');

  await button('미리보기');
  const expected = [names.slice(0, 2).join(), names.slice(2, 5).join(), names[5]];
  const live = await playback('.preview');
  assert.ok(live.length >= 4 && live.every((s, i) => s === expected[(expected.indexOf(live[0]) + i) % 3]), `editor plays 2 · 3 · 1: ${live.map(s => s.split(',').length)}`);
  await button('미리보기 닫기');
  if (process.env.VERIFY_OUT) await (await page.$('.photo-list')).screenshot({ path: process.env.VERIFY_OUT + '/steps-panel.png' });

  // Published through the real checks, and played publicly the same way.
  await button('저장'); await status('이 브라우저에 저장됨');
  await button('게시'); await status('게시됨');
  const deck = JSON.parse(published.get(`public/decks/${ID}/deck.json`));
  const [seq] = deck.slides;
  assert.equal(seq.perFrame, undefined);
  assert.deepEqual(seq.photos.map(p => !!p.joined), [false, true, false, true, true, false]);
  await page.goto(base + '261103-yun/');
  await page.waitForSelector('.presentation .sequence-step');
  const shown = await playback('.presentation');
  assert.ok(shown.length >= 4 && shown.every((s, i) => s === expected[(expected.indexOf(shown[0]) + i) % 3]), `public plays 2 · 3 · 1: ${shown.map(s => s.split(',').length)}`);

  // 한 번에 regroups everything evenly again.
  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  await page.evaluate(() => document.querySelector('.card .card-title').click());
  await assertPanel('ab cde f', 'reopened');
  await setField('한 번에', '3');
  await assertPanel('abc def', '한 번에 3 regroups all');
  assert.deepEqual(await perFrame(), ['3', '—']);
  // Joining every step makes one step evenly: stored as 한 번에 6.
  await row(names[3], '앞 순번과 묶기');
  await assertPanel('abcdef', 'one step');
  assert.deepEqual(await perFrame(), ['6', '—'], 'even steps are 한 번에 again');
  assert.deepEqual(errors, []);
  console.log('steps: 한 번에 2 → 묶기/풀기 to 2·3·1, rules mark the steps, move swaps places, remove shrinks a step, undo, 격자 and back keep them, editor and public play 2·3·1 (published as joined images), 한 번에 3 regroups, one even step is 한 번에 6');
} finally {
  await browser.close();
}
