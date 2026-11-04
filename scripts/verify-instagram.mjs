// Instagram post → one slide, with the server answered by a mock (no token, no Instagram): a carousel of
// image, image, video and a still (a video without media_url) comes in as one sequence in the post's
// order, images at 2 s and the video at its length, playing inside the sheet's margin like an image;
// files arrive in parts; errors show as status.
// Also checks that the dev server's real handler says when the token is missing.
// Needs the dev server on 3100 and Google Chrome; the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { executePublish } from '../server/publish.ts';
import { catalogEntries } from '../app/catalog.ts';
const base = 'http://127.0.0.1:3100/presentations/';
const ID = '2026-11-03-yoon-jaeyoung-graduation-project';
// A mock GitHub behind the real publish checks (as in verify-composition).
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
  if (p === 'contents/public/decks?ref=main') return []; // nothing published yet
  throw Error('Unexpected Git request ' + p);
};
const types = { mp4: 'video/mp4', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-instagram-'));
const clip = path.join(work, 'clip.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1350:rate=30:duration=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip]);
const imageDir = new URL('../../261103-yun/portfolio-images/2025.12-audio-morphology/', import.meta.url).pathname;
const [a, b, c] = fs.readdirSync(imageDir).filter(n => n.endsWith('.webp')).sort().slice(0, 3).map(n => fs.readFileSync(imageDir + n));
const files = { 'https://scontent.cdninstagram.com/1.webp': [a, 'image/webp'], 'https://scontent.cdninstagram.com/2.webp': [b, 'image/webp'], 'https://video.fbcdn.net/3.mp4': [fs.readFileSync(clip), 'video/mp4'], 'https://scontent.cdninstagram.com/4.webp': [c, 'image/webp'] };

// The real handler without INSTAGRAM_ACCESS_TOKEN (the dev server is started without it).
const missing = await fetch(base + 'api/capture?instagram=' + encodeURIComponent('https://www.instagram.com/p/DS7HWFfCXIl/'));
assert.equal(missing.status, 503);
assert.match(await missing.text(), /INSTAGRAM_ACCESS_TOKEN/);
assert.equal((await fetch(base + 'api/capture?instagram-asset=' + encodeURIComponent('https://example.com/x.jpg'))).status, 400, 'only the CDN');

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [], requests = [];
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
      return req.respond(file ? { status: 200, contentType: types[u.pathname.split('.').pop()] || 'application/json', body: file } : { status: 404, body: '{}' });
    }
    if (u.pathname.endsWith('/api/capture') && u.searchParams.has('instagram')) {
      requests.push('post');
      return u.searchParams.get('instagram').includes('ZZZZZZ')
        ? req.respond({ status: 404, contentType: 'text/plain; charset=utf-8', body: '연결된 인스타그램 계정의 게시물에서 찾지 못했습니다.' })
        : req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'DS7HWFfCXIl', title: '전시 기록', items: [
          { type: 'image', url: 'https://scontent.cdninstagram.com/1.webp' }, { type: 'image', url: 'https://scontent.cdninstagram.com/2.webp' },
          { type: 'video', url: 'https://video.fbcdn.net/3.mp4' }, { type: 'image', url: 'https://scontent.cdninstagram.com/4.webp', still: true }] }) });
    }
    if (u.pathname.endsWith('/api/capture') && u.searchParams.has('instagram-asset')) {
      // Parts of a third of the file, so every file takes several requests.
      const [bytes, type] = files[u.searchParams.get('instagram-asset')], size = Math.ceil(bytes.length / 3), part = Number(u.searchParams.get('part'));
      requests.push(u.searchParams.get('instagram-asset').split('/').pop() + ':' + part);
      return req.respond({ status: 200, headers: { 'Content-Type': type, 'X-Asset-Size': String(bytes.length), 'Access-Control-Expose-Headers': 'X-Asset-Size' }, body: bytes.subarray(part * size, (part + 1) * size) });
    }
    req.continue();
  });
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const click = label => page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled).click(), label);
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 30000 }, text);
  const cards = () => page.$$eval('.card .card-title', ts => ts.map(t => t.textContent));
  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();

  await click('추가');
  await page.type('[aria-label="웹 또는 영상 주소"]', 'https://www.instagram.com/p/ZZZZZZ/');
  await click('링크 추가');
  await status('찾지 못했습니다');
  assert.equal((await cards()).length, 0, 'nothing added on an error');

  await page.$eval('[aria-label="웹 또는 영상 주소"]', i => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.type('[aria-label="웹 또는 영상 주소"]', 'https://www.instagram.com/jaeyeonkim.kr/p/DS7HWFfCXIl/?img_index=1');
  await click('링크 추가');
  await status('인스타그램 4개 가져옴');
  assert.match(await page.$eval('[role=status]', e => e.textContent), /영상 1개는 음원 저작권/);
  await ready();
  assert.deepEqual(await cards(), ['전시 기록'], 'one slide for the post');
  // Files download four at a time, each in its parts; the items still follow the post's order.
  assert.deepEqual([...requests].sort(), ['post', 'post', '1.webp:0', '1.webp:1', '1.webp:2', '2.webp:0', '2.webp:1', '2.webp:2', '3.mp4:0', '3.mp4:1', '3.mp4:2', '4.webp:0', '4.webp:1', '4.webp:2'].sort());
  // One sequence: images at 2 s, the video at its length (1 s), each changeable.
  await page.click('.card:nth-child(1) .thumbnail');
  assert.deepEqual(await page.$$eval('.photo-row', rows => rows.map(r => [r.querySelector('span').textContent, r.querySelector('input').placeholder])),
    [['DS7HWFfCXIl-01.webp', '2'], ['DS7HWFfCXIl-02.webp', '2'], ['DS7HWFfCXIl-03.mp4', '1'], ['DS7HWFfCXIl-04.webp', '2']]);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('간격')).querySelector('input').value), '2000');
  // Live preview: the video step plays inside the sheet's margin like the images, then the sequence moves on.
  const setDuration = (i, value) => page.evaluate((i, value) => { const input = document.querySelectorAll('.photo-row input')[i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }, i, value);
  await setDuration(0, '0.3'); await setDuration(1, '0.3');
  await click('미리보기');
  const shown = () => page.evaluate(() => { const step = [...document.querySelectorAll('.preview .sequence-step')].find(s => s.style.visibility === 'visible'); return step?.querySelector('img, video')?.tagName + ':' + (step?.querySelector('img')?.alt || step?.querySelector('video')?.getAttribute('aria-label')); });
  await page.waitForFunction(() => { const step = [...document.querySelectorAll('.preview .sequence-step')].find(s => s.style.visibility === 'visible'); const v = step?.querySelector('video'); return v && v.currentTime > 0.2 && !v.paused; }, { timeout: 15000 });
  assert.equal(await shown(), 'VIDEO:DS7HWFfCXIl-03.mp4');
  const placed = await page.$eval('.preview', box => {
    const sheet = box.querySelector('.slide-sheet').getBoundingClientRect(), unit = sheet.width / 1920;
    const step = [...box.querySelectorAll('.sequence-step')].find(s => s.style.visibility === 'visible');
    const r = step.querySelector('.photo-placement').getBoundingClientRect();
    return [r.left - sheet.left, r.top - sheet.top, sheet.right - r.right, sheet.bottom - r.bottom].map(v => Math.round(v / unit));
  });
  assert.ok(placed.every(v => v >= 63), `the video keeps the sheet's 64 margin: ${placed}`);
  assert.equal(placed[1], 64, 'as tall as the sheet allows, like an image');
  await page.waitForFunction(() => [...document.querySelectorAll('.preview .sequence-step')].find(s => s.style.visibility === 'visible')?.querySelector('img')?.alt === 'DS7HWFfCXIl-04.webp', { timeout: 5000 });
  await click('미리보기 닫기');
  // Not playing (thumbnail, closed preview): the video is its still frame.
  assert.equal(await page.$$eval('.card:nth-child(1) .thumbnail video', v => v.length), 0);
  await click('추가');
  assert.equal(await page.$eval('[aria-label="웹 또는 영상 주소"]', i => i.value), '', 'the link field is cleared');
  await click('추가');
  // Saved like any dropped files: survives a reload with its images and video.
  await click('저장'); await status('이 브라우저에 저장됨');
  await page.reload(); await page.waitForSelector('.toolbar'); await ready();
  assert.equal((await cards()).length, 1);
  await page.click('.card:nth-child(1) .thumbnail');
  assert.equal(await page.$$eval('.photo-row', r => r.length), 4);
  await page.waitForFunction(() => document.querySelector('.card .thumbnail img')?.naturalWidth > 0, { timeout: 20000 });
  // Published (real server checks): the video file and its still go up with the images; the public
  // viewer plays the video as a step of the sequence.
  await click('게시'); await status('게시됨');
  const deck = JSON.parse(published.get(`public/decks/${ID}/deck.json`));
  assert.deepEqual(deck.slides.map(s => s.kind), ['sequence']);
  const video = deck.slides[0].photos[2];
  assert.equal(video.video, true); assert.equal(video.length, 1);
  assert.match(deck.assets[video.id], /\.mp4$/); assert.match(deck.assets[video.poster], /\.(webp|png)$/);
  assert.equal(Object.keys(deck.assets).length, 5, 'three images, the video and its still');
  await page.goto(base + '261103-yun/');
  await page.waitForSelector('.presentation');
  await page.waitForFunction(() => { const step = [...document.querySelectorAll('.presentation .sequence-step')].find(s => s.style.visibility === 'visible'); const v = step?.querySelector('video'); return v && v.currentTime > 0.2 && !v.paused; }, { timeout: 20000 });
  assert.deepEqual(errors, []);
  console.log('instagram: missing token and non-CDN files refused by the real handler; mocked carousel → one sequence (images 2 s, video at its length inside the margin, still) in order, parts reassembled, error leaves the deck, saved, published (mp4 + still) and played publicly');
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
