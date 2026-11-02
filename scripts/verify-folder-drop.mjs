// Finder folders dropped on the slide list (a real drag of real folders through Chrome DevTools): a
// folder with images is one sequence holding its videos too, in name order, images 2 s each then, its
// subfolders left out; a folder of images alone stays a quick sequence; a folder of videos alone gives clips.
// Needs the dev server on 3100, Google Chrome and ffmpeg; the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base = 'http://127.0.0.1:3100/presentations/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-folder-drop-'));
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const image = (file, color) => ffmpeg('-f', 'lavfi', '-i', `color=c=${color}:s=640x480:d=1`, '-frames:v', '1', file);
const video = (file, color, seconds) => ffmpeg('-f', 'lavfi', '-i', `color=c=${color}:s=360x360:r=30:d=${seconds}`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file);
// A post-like folder: image, video, image, video, with covers in a subfolder.
const post = path.join(work, 'post'), images = path.join(work, 'frames'), videos = path.join(work, 'videos');
for (const dir of [post, path.join(post, 'covers'), images, videos]) fs.mkdirSync(dir);
image(path.join(post, '01.png'), 'red'); video(path.join(post, '02.mp4'), 'blue', 1.5); image(path.join(post, '10.png'), 'green'); video(path.join(post, '03.mp4'), 'yellow', 2);
image(path.join(post, 'covers', '02-cover.png'), 'white');
image(path.join(images, 'a.png'), 'red'); image(path.join(images, 'b.png'), 'blue');
video(path.join(videos, 'x.mp4'), 'red', 1); video(path.join(videos, 'y.mp4'), 'blue', 1);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => req.url().includes('/decks/2026-11-03-') ? req.respond({ status: 404, body: '{}' }) : req.continue());
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const client = await page.target().createCDPSession();
  const drop = async (...folders) => {
    const before = await page.$$eval('.card', c => c.length);
    const { x, y } = await page.$eval('.workspace', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const data = { items: [], files: folders, dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await client.send('Input.dispatchDragEvent', { type, x, y, data });
    await page.waitForFunction(n => document.querySelectorAll('.card').length > n, { timeout: 30000 }, before);
    await ready();
    return page.$$eval('.card', (cards, n) => cards.slice(n).map(c => c.querySelector('.card-title').textContent), before);
  };
  const panel = () => page.evaluate(() => ({
    rows: [...document.querySelectorAll('.photo-row > span')].map(s => s.textContent),
    videos: [...document.querySelectorAll('.photo-row')].map(r => r.nextElementSibling?.classList.contains('photo-range') ? 'video' : 'image'),
    seconds: [...document.querySelectorAll('.photo-row input')].map(i => i.placeholder),
    interval: [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith('간격'))?.querySelector('input').value,
    kind: [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith('배열'))?.querySelector('select').value,
  }));

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  assert.deepEqual(await drop(post), ['post'], 'the folder is one slide');
  assert.deepEqual(await panel(), { rows: ['01.png', '02.mp4', '03.mp4', '10.png'], videos: ['image', 'video', 'video', 'image'], seconds: ['2', '1.5', '2', '2'], interval: '2000', kind: 'sequence' },
    'images and videos in name order, covers left out, 2 s an image and a video its length');
  // The video items play in their steps.
  await page.evaluate(() => [...document.querySelectorAll('.properties button')].find(b => b.textContent === '미리보기').click());
  await page.waitForFunction(() => { const v = document.querySelector('.preview .sequence-step[style*="visible"] video'); return v && !v.paused && v.currentTime > 0.2; }, { timeout: 10000 });

  assert.deepEqual(await drop(images), ['frames'], 'images alone: one sequence');
  assert.deepEqual(await panel(), { rows: ['a.png', 'b.png'], videos: ['image', 'image'], seconds: ['0.4', '0.4'], interval: '400', kind: 'sequence' }, 'at the quick interval as before');
  assert.deepEqual(await drop(videos), ['x', 'y'], 'videos alone: a clip each as before');
  assert.deepEqual(errors, []);
  console.log('folder drop: images + videos → one sequence in name order (2 s an image, a video its length, subfolder left out, videos play); images alone → 0.4 s sequence; videos alone → clips');
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
