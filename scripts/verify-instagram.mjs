// Instagram post → slides, with the server answered by a mock (no token, no Instagram): a carousel of
// image, image, video, image comes in as a sequence of two (2 s each), a clip and a picture slide, in
// order; files arrive in parts; a video without media_url comes in as a still; errors show as status.
// Also checks that the dev server's real handler says when the token is missing.
// Needs the dev server on 3100 and Google Chrome; the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base = 'http://127.0.0.1:3100/presentations/';
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

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [], requests = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    const u = new URL(req.url());
    if (u.pathname.includes('/decks/2026-11-03-yoon-jaeyoung-graduation-project/')) return req.respond({ status: 404, body: '{}' });
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
  assert.deepEqual(await cards(), ['전시 기록', '전시 기록', '전시 기록']);
  assert.deepEqual(requests, ['post', 'post', '1.webp:0', '1.webp:1', '1.webp:2', '2.webp:0', '2.webp:1', '2.webp:2', '3.mp4:0', '3.mp4:1', '3.mp4:2', '4.webp:0', '4.webp:1', '4.webp:2']);
  // The sequence: two images at 2 s, each changeable; then the clip; then the still as a picture slide.
  await page.click('.card:nth-child(1) .thumbnail');
  assert.deepEqual(await page.$$eval('.photo-row', rows => rows.map(r => [r.querySelector('span').textContent, r.querySelector('input').placeholder])), [['DS7HWFfCXIl-01.webp', '2'], ['DS7HWFfCXIl-02.webp', '2']]);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('간격')).querySelector('input').value), '2000');
  await page.click('.card:nth-child(2) .thumbnail');
  await page.waitForFunction(() => document.querySelector('.properties')?.textContent.includes('끝나면') && !document.querySelector('.photo-row'));
  await page.click('.card:nth-child(3) .thumbnail');
  assert.deepEqual(await page.$$eval('.photo-row span', s => s.map(x => x.textContent)), ['DS7HWFfCXIl-04.webp']);
  await click('추가');
  assert.equal(await page.$eval('[aria-label="웹 또는 영상 주소"]', i => i.value), '', 'the link field is cleared');
  await click('추가');
  // Saved like any dropped files: survives a reload with its images.
  await click('저장'); await status('이 브라우저에 저장됨');
  await page.reload(); await page.waitForSelector('.toolbar'); await ready();
  assert.equal((await cards()).length, 3);
  await page.waitForFunction(() => [...document.querySelectorAll('.card .thumbnail img, .card .thumbnail video')].length >= 3, { timeout: 20000 });
  assert.deepEqual(errors, []);
  console.log('instagram: missing token and non-CDN files refused by the real handler; mocked carousel → sequence (2 s) + clip + still in order, parts reassembled, error leaves the deck, saved');
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
