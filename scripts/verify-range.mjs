// Playback ranges, with every outside service answered by a mock: a clip, a video of an Instagram
// sequence, YouTube, a Vimeo player (a fake that speaks the player's postMessage API) and the exhibition
// video. The test video is red for 2 s, then blue for 2 s, so a still redrawn at the range start is blue.
// Checks: fields and placeholders, playback stays inside the range and loops / holds there, the still
// follows the start and undoes with it, the sequence step lasts the range, YouTube gets whole seconds,
// Vimeo is sought and looped through its API, and the ranges publish (real checks) and play publicly.
// Needs the dev server on 3100, Google Chrome and ffmpeg; the 11/3 deck starts empty (published file answered 404).
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
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-range-'));
const clip = path.join(work, 'red-blue.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'color=c=blue:s=640x360:r=30:d=2',
  '-filter_complex', '[0][1]concat=n=2:v=1[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '15', clip]);
const imageDir = new URL('../../261103-yun/portfolio-images/2025.12-audio-morphology/', import.meta.url).pathname;
const image = fs.readFileSync(imageDir + fs.readdirSync(imageDir).filter(n => n.endsWith('.webp')).sort()[0]);
const files = { 'https://scontent.cdninstagram.com/1.webp': [image, 'image/webp'], 'https://video.fbcdn.net/2.mp4': [fs.readFileSync(clip), 'video/mp4'] };
// A fake Vimeo player: a clock from the address's #t, ready on load, timeupdate every 100 ms once asked,
// setCurrentTime / pause / play, and every message it gets echoed to the page as {event: 'received'}.
const vimeoPlayer = `<!doctype html><body style="margin:0;background:#123"><script>
  let time = Number((location.hash.match(/t=(\\d+)s/) || [])[1] || 0), playing = true, listening = false, last = performance.now();
  const post = m => parent.postMessage(JSON.stringify(m), '*');
  addEventListener('message', e => {
    const m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    post({ event: 'received', data: m });
    if (m.method === 'addEventListener' && m.value === 'timeupdate') listening = true;
    if (m.method === 'setCurrentTime') time = m.value;
    if (m.method === 'pause') playing = false;
    if (m.method === 'play') playing = true;
  });
  setInterval(() => { const now = performance.now(); if (playing) time += (now - last) / 1000; last = now; if (listening) post({ event: 'timeupdate', data: { seconds: time, duration: 60 } }); }, 100);
  post({ event: 'ready' });
</script>`;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
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
      const file = published.get('public/' + u.pathname.slice('/presentations/'.length)), range = req.headers().range?.match(/bytes=(\d+)-(\d*)/);
      if (!file) return req.respond({ status: 404, body: '{}' });
      // Byte ranges like the static host, so a published video can be sought.
      if (range) { const a = Number(range[1]), b = range[2] ? Math.min(Number(range[2]), file.length - 1) : file.length - 1; return req.respond({ status: 206, headers: { 'Content-Type': types[u.pathname.split('.').pop()], 'Content-Range': `bytes ${a}-${b}/${file.length}`, 'Accept-Ranges': 'bytes' }, body: file.subarray(a, b + 1) }); }
      return req.respond({ status: 200, headers: { 'Content-Type': types[u.pathname.split('.').pop()] || 'application/json', 'Accept-Ranges': 'bytes' }, body: file });
    }
    if (u.pathname.endsWith('/api/capture') && u.searchParams.has('instagram'))
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'RANGE01', title: '구간', items: [{ type: 'image', url: 'https://scontent.cdninstagram.com/1.webp' }, { type: 'video', url: 'https://video.fbcdn.net/2.mp4' }] }) });
    if (u.pathname.endsWith('/api/capture') && u.searchParams.has('instagram-asset')) {
      const [bytes, type] = files[u.searchParams.get('instagram-asset')];
      return req.respond({ status: 200, headers: { 'Content-Type': type, 'X-Asset-Size': String(bytes.length), 'Access-Control-Expose-Headers': 'X-Asset-Size' }, body: bytes });
    }
    // Web captures (the Vimeo slide is captured when added) get a plain image instead of a real capture.
    if (u.pathname.endsWith('/api/capture') && u.searchParams.has('url'))
      return req.respond({ status: 200, headers: { 'Content-Type': 'image/webp', 'X-Toolbar-Color': '#ffffff', 'Access-Control-Expose-Headers': 'X-Toolbar-Color' }, body: image });
    if (u.hostname === 'player.vimeo.com') return req.respond({ status: 200, contentType: 'text/html', body: vimeoPlayer });
    if (u.hostname.includes('youtube')) return req.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>yt</title>' });
    req.continue();
  });
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const click = label => page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled).click(), label);
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 30000 }, text);
  const field = (label, scope = '.properties') => page.evaluate((label, scope) => { const input = [...document.querySelectorAll(scope + ' label')].find(l => l.textContent.trim() === label)?.querySelector('input'); return input && { value: input.value, placeholder: input.placeholder }; }, label, scope);
  const setField = (label, value, scope = '.properties') => page.evaluate((label, value, scope) => {
    const input = [...document.querySelectorAll(scope + ' label')].find(l => l.textContent.trim() === label).querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, label, value, scope);
  // [currentTime, paused] of the first video matching the selector, every 50 ms.
  const sample = (selector, ms) => page.evaluate(async (selector, ms) => {
    const out = [], end = performance.now() + ms;
    while (performance.now() < end) { const v = document.querySelector(selector); if (v) out.push([v.currentTime, v.paused]); await new Promise(r => setTimeout(r, 50)); }
    return out;
  }, selector, ms);
  const color = selector => page.$eval(selector, async img => {
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 1;
    c.getContext('2d').drawImage(img, img.naturalWidth / 2, img.naturalHeight / 2, 1, 1, 0, 0, 1, 1);
    const [r, , b] = c.getContext('2d').getImageData(0, 0, 1, 1).data;
    return r > 150 && b < 100 ? 'red' : b > 150 && r < 100 ? 'blue' : `${r},${b}`;
  });
  const select = title => page.evaluate(title => [...document.querySelectorAll('.card .card-title')].find(t => t.textContent === title).click(), title);
  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();

  // Clip: 2.5–3.5 s of the red/blue video.
  await click('추가');
  const [input] = await page.$$('input[type=file][accept="video/mp4,video/webm"]');
  await input.uploadFile(clip);
  await status('저장되지 않음'); await ready();
  await select('red-blue');
  assert.deepEqual([await field('시작 초'), await field('끝 초')], [{ value: '', placeholder: '0' }, { value: '', placeholder: '4' }], 'empty is the start and the length');
  assert.equal(await color('.preview img.capture-preview'), 'red', 'the still is near the start');
  await setField('시작 초', '2.5'); await setField('끝 초', '3.5');
  await page.waitForFunction(() => document.querySelector('.preview img.capture-preview')?.complete, { timeout: 10000 });
  await page.waitForFunction(async () => { const img = document.querySelector('.preview img.capture-preview'); await img.decode(); const c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').drawImage(img, img.naturalWidth / 2, img.naturalHeight / 2, 1, 1, 0, 0, 1, 1); return c.getContext('2d').getImageData(0, 0, 1, 1).data[2] > 150; }, { timeout: 10000 });
  assert.equal(await color('.card .thumbnail img'), 'blue', 'the thumbnail follows the range start');
  // A start past the end is not taken: the field goes back to the range when it is left.
  await setField('시작 초', '3.6');
  await page.evaluate(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim() === '시작 초').querySelector('input').dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
  assert.equal((await field('시작 초')).value, '2.5');
  await click('미리보기');
  let times = await sample('.preview video', 2600);
  const playing = times.filter(([, paused]) => !paused).map(([t]) => t);
  assert.ok(playing.length > 20 && playing.every(t => t >= 2.45 && t <= 3.56), `stays inside 2.5–3.5: ${playing.map(t => t.toFixed(2))}`);
  assert.ok(playing.some((t, i) => i && t < playing[i - 1] - 0.5), 'and loops back to its start');
  await page.evaluate(() => { const s = [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('끝나면')).querySelector('select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'hold'); s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForFunction(() => { const v = document.querySelector('.preview video'); return v?.paused && v.currentTime > 3.4; }, { timeout: 5000 });
  const held = await page.$eval('.preview video', v => v.currentTime);
  assert.ok(held >= 3.45 && held < 3.6, `holds at the end of the range: ${held}`);
  await click('미리보기 닫기');
  // Undo takes the range and its still back together (the redrawn still joined the start's step).
  for (let i = 0; i < 3; i++) await click('되돌리기');
  assert.deepEqual([(await field('시작 초')).value, (await field('끝 초')).value], ['', ''], 'start, end and 끝나면 were three steps');
  assert.equal(await color('.preview img.capture-preview'), 'red', 'the earlier still is back');
  await setField('시작 초', '2.5'); await setField('끝 초', '3.5');

  // Instagram sequence: an image, then the video playing 2.5–3.5, its step 1 s.
  await click('추가');
  await page.type('[aria-label="웹 또는 영상 주소"]', 'https://www.instagram.com/p/RANGE01/');
  await click('링크 추가');
  await status('인스타그램 2개 가져옴'); await ready();
  await select('구간');
  assert.deepEqual([await field('초부터', '.photo-range'), await field('초까지', '.photo-range')], [{ value: '', placeholder: '0' }, { value: '', placeholder: '4' }]);
  assert.equal(await page.$$eval('.photo-range', r => r.length), 1, 'only the video has a range');
  await setField('초부터', '2.5', '.photo-range'); await setField('초까지', '3.5', '.photo-range');
  // The video row's thumbnail is its still, redrawn at the range start (blue).
  await page.waitForFunction(async () => { const img = document.querySelectorAll('.photo-row')[1]?.querySelector('.photo-thumb img'); if (!img) return false; await img.decode().catch(() => undefined); const c = document.createElement('canvas'); c.width = c.height = 1; c.getContext('2d').drawImage(img, img.naturalWidth / 2, img.naturalHeight / 2, 1, 1, 0, 0, 1, 1); return c.getContext('2d').getImageData(0, 0, 1, 1).data[2] > 150; }, { timeout: 10000 });
  assert.deepEqual(await page.$$eval('.photo-row input', i => i.map(x => x.placeholder)), ['2', '1'], 'the video’s step lasts its range');
  await page.evaluate(() => { const input = document.querySelector('.photo-row input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '0.3'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('미리보기');
  const visibleVideo = '.preview .sequence-step[style*="visible"] video';
  await page.waitForSelector(visibleVideo, { timeout: 10000 });
  const stepStart = Date.now();
  times = (await sample(visibleVideo, 700)).filter(([, paused]) => !paused).map(([t]) => t);
  assert.ok(times.length > 5 && times.every(t => t >= 2.45 && t <= 3.56), `the step plays 2.5–3.5: ${times.map(t => t.toFixed(2))}`);
  await page.waitForFunction(sel => !document.querySelector(sel), { timeout: 5000 }, visibleVideo);
  const lasted = Date.now() - stepStart;
  assert.ok(lasted > 700 && lasted < 1700, `then the sequence moves on after about 1 s: ${lasted} ms`);
  await click('미리보기 닫기');
  // PDF: the clip, then a page per step of the sequence; videos print as their stills, redrawn at the range
  // start (blue), not as video elements.
  await page.evaluate(() => { window.print = () => {
    window.__printed = [...document.querySelectorAll('.print-slide')].map(slide => {
      const shown = [...slide.querySelectorAll('img')].filter(i => !i.closest('.sequence-step') || i.closest('.sequence-step').style.visibility === 'visible');
      return { videos: slide.querySelectorAll('video').length, colors: shown.map(img => {
        const c = document.createElement('canvas'); c.width = c.height = 1;
        c.getContext('2d').drawImage(img, img.naturalWidth / 2, img.naturalHeight / 2, 1, 1, 0, 0, 1, 1);
        const [r, , b] = c.getContext('2d').getImageData(0, 0, 1, 1).data;
        return r > 150 && b < 100 ? 'red' : b > 150 && r < 100 ? 'blue' : 'image';
      }) };
    });
  }; });
  await click('PDF');
  await page.waitForFunction(() => window.__printed, { timeout: 30000 });
  const printed = await page.evaluate(() => window.__printed);
  assert.deepEqual(printed, [{ videos: 0, colors: ['blue'] }, { videos: 0, colors: ['image'] }, { videos: 0, colors: ['blue'] }], `PDF pages: ${JSON.stringify(printed)}`);

  // YouTube: whole seconds, widened.
  await click('추가');
  await page.type('[aria-label="웹 또는 영상 주소"]', 'https://youtu.be/QIAcSGkOLDk');
  await click('링크 추가'); await ready();
  await setField('시작 초', '12.6'); await setField('끝 초', '30.2');
  await click('미리보기');
  const youtube = new URL(await page.$eval('.preview iframe', f => f.src));
  assert.deepEqual([youtube.searchParams.get('start'), youtube.searchParams.get('end')], ['12', '31']);
  await click('미리보기 닫기');

  // Vimeo: the page link becomes the player; pasted embed code with loop=1 loops 10–12 through the API.
  await click('추가');
  await page.type('[aria-label="웹 또는 영상 주소"]', '<iframe src="https://player.vimeo.com/video/123456789?h=abc&amp;loop=1" frameborder="0"></iframe>');
  await click('링크 추가'); await status('캡처'); await ready();
  await setField('시작 초', '10'); await setField('끝 초', '12');
  await page.evaluate(() => { window.vimeo = []; addEventListener('message', e => { if (e.origin === 'https://player.vimeo.com') window.vimeo.push(JSON.parse(e.data)); }); });
  await click('미리보기');
  assert.match(await page.$eval('.preview iframe', f => f.src), /^https:\/\/player\.vimeo\.com\/video\/123456789\?h=abc&loop=1#t=10s$/);
  await new Promise(r => setTimeout(r, 3500));
  const vimeo = await page.evaluate(() => window.vimeo);
  const received = vimeo.filter(m => m.event === 'received').map(m => m.data);
  assert.ok(received.some(m => m.method === 'addEventListener' && m.value === 'timeupdate'), 'listens to its time');
  assert.ok(received.filter(m => m.method === 'setCurrentTime' && m.value === 10).length >= 2, 'starts at 10 and goes back there at 12');
  const seconds = vimeo.filter(m => m.event === 'timeupdate').map(m => m.data.seconds);
  assert.ok(seconds.every(s => s >= 9.9 && s < 12.2), `stays inside 10–12: ${seconds.map(s => s.toFixed(1))}`);
  assert.ok(!received.some(m => m.method === 'pause'), 'loop=1 loops instead of pausing');
  await click('미리보기 닫기');
  // The plain page link: the player (no loop), so the end pauses.
  await click('추가');
  await page.type('[aria-label="웹 또는 영상 주소"]', 'https://vimeo.com/987654321');
  await click('링크 추가'); await status('캡처'); await ready();
  assert.ok(await field('시작 초'), 'the page link became the player');
  await setField('시작 초', '1'); await setField('끝 초', '2');
  await page.evaluate(() => { window.vimeo = []; });
  await click('미리보기');
  await page.waitForFunction(() => window.vimeo.some(m => m.event === 'received' && m.data.method === 'pause'), { timeout: 5000 });
  await click('미리보기 닫기');

  // The exhibition video (controls): 100–101 s, then it stops.
  await click('추가'); await click('음향형태론 전시 영상'); await ready();
  await setField('시작 초', '100'); await setField('끝 초', '101');
  await click('미리보기');
  // The editor's preview does not autoplay it; playing starts at the range.
  await page.waitForFunction(() => document.querySelector('.preview video')?.readyState >= 1, { timeout: 20000 });
  await page.$eval('.preview video', v => v.play());
  await page.waitForFunction(() => { const v = document.querySelector('.preview video'); return v?.paused && v.currentTime > 100.5; }, { timeout: 20000 });
  const stopped = await page.$eval('.preview video', v => v.currentTime);
  assert.ok(stopped >= 100.95 && stopped < 101.1, `stops at the end of its range: ${stopped}`);
  await click('미리보기 닫기');

  // Saved and published through the real checks; the public viewer plays the clip inside its range.
  await click('저장'); await status('이 브라우저에 저장됨');
  await click('게시'); await status('게시됨');
  const deck = JSON.parse(published.get(`public/decks/${ID}/deck.json`));
  const byTitle = Object.fromEntries(deck.slides.map(s => [s.title, s]));
  assert.deepEqual([byTitle['red-blue'].media.from, byTitle['red-blue'].media.to, byTitle['red-blue'].media.length], [2.5, 3.5, 4]);
  assert.deepEqual([byTitle['구간'].photos[1].from, byTitle['구간'].photos[1].to], [2.5, 3.5]);
  const youtubeSlide = deck.slides.find(s => s.kind === 'youtube');
  assert.deepEqual([youtubeSlide.from, youtubeSlide.to], [12.6, 30.2]);
  assert.deepEqual(deck.slides.filter(s => s.kind === 'web').map(s => [s.src, s.from, s.to]), [['https://player.vimeo.com/video/123456789?h=abc&loop=1', 10, 12], ['https://player.vimeo.com/video/987654321', 1, 2]]);
  assert.deepEqual([byTitle['음향형태론 전시 영상'].from, byTitle['음향형태론 전시 영상'].to], [100, 101]);
  assert.ok(deck.assets[byTitle['red-blue'].previewId] && deck.assets[byTitle['구간'].photos[1].poster], 'the redrawn stills go up');
  await page.goto(base + '261103-yun/');
  await page.waitForSelector('.presentation');
  await page.waitForFunction(() => { const v = document.querySelector('.presentation video'); return v && !v.paused && v.currentTime > 2.5; }, { timeout: 20000 });
  times = (await sample('.presentation video', 1500)).filter(([, paused]) => !paused).map(([t]) => t);
  assert.ok(times.every(t => t >= 2.45 && t <= 3.56), `public playback stays inside the range: ${times.map(t => t.toFixed(2))}`);
  assert.deepEqual(errors, []);
  console.log('range: clip 2.5–3.5 loops and holds, still redrawn at the start and undone with it; sequence video plays its range for a 1 s step; PDF prints the clip and each sequence step as stills; YouTube start=12 end=31; Vimeo sought to 10 and looped at 12 (pause without loop); exhibition video stops at 101; published and played publicly inside the range');
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
