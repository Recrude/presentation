// Space in the presentation: on a sequence it pauses and plays on (its step keeps the time it had left,
// a video in that step stops where it is, the slide's auto-advance waits too); on any other slide it is
// still the next slide; leaving a paused sequence and coming back plays it again.
// Deck (dropped like Finder through Chrome DevTools): a picture, a sequence (image, video, image), a picture.
// Needs the dev server on 3100, Google Chrome and ffmpeg; the 11/3 deck starts empty (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base = 'http://127.0.0.1:3100/presentations/';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-pause-'));
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
const image = (file, color) => ffmpeg('-f', 'lavfi', '-i', `color=c=${color}:s=640x480:d=1`, '-frames:v', '1', file);
const seq = path.join(work, 'seq');
fs.mkdirSync(seq);
image(path.join(work, 'first.png'), 'white'); image(path.join(work, 'last.png'), 'gray');
image(path.join(seq, '01.png'), 'red'); image(path.join(seq, '03.png'), 'green');
ffmpeg('-f', 'lavfi', '-i', 'testsrc2=size=360x360:rate=30:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(seq, '02.mp4'));

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => req.url().includes('/decks/2026-11-03-') ? req.respond({ status: 404, body: '{}' }) : req.continue());
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const client = await page.target().createCDPSession();
  const drop = async file => {
    const before = await page.$$eval('.card', c => c.length);
    const { x, y } = await page.$eval('.workspace', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    for (const type of ['dragEnter', 'dragOver', 'drop']) await client.send('Input.dispatchDragEvent', { type, x, y, data: { items: [], files: [file], dragOperationsMask: 1 } });
    await page.waitForFunction(n => document.querySelectorAll('.card').length > n, { timeout: 30000 }, before);
    await ready();
  };
  const setField = (label, value) => page.evaluate((label, value) => {
    const input = [...document.querySelectorAll('.properties label')].find(l => l.textContent.trim().startsWith(label)).querySelector('input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, label, value);
  const select = title => page.evaluate(title => [...document.querySelectorAll('.card .card-title')].find(t => t.textContent === title).click(), title);
  const present = async () => { await page.evaluate(() => [...document.querySelectorAll('.toolbar button')].find(b => b.textContent.trim() === '발표').click()); await page.waitForSelector('.presentation-layer'); };
  // What the presentation shows: the slide (by its image names) and, on the sequence, the visible step.
  const shown = () => page.evaluate(() => {
    const layer = document.querySelector('.presentation-layer[aria-hidden="false"]');
    const step = layer && [...layer.querySelectorAll('.sequence-step')].find(s => s.style.visibility === 'visible');
    return step ? [...step.querySelectorAll('img, video')].map(m => m.alt || m.getAttribute('aria-label')).join(',') : [...(layer?.querySelectorAll('img') || [])].map(i => i.alt).join(',');
  });
  const until = (name, timeout = 10000) => page.waitForFunction(name => {
    const layer = document.querySelector('.presentation-layer[aria-hidden="false"]');
    const step = layer && [...layer.querySelectorAll('.sequence-step')].find(s => s.style.visibility === 'visible');
    return (step ? [...step.querySelectorAll('img, video')].map(m => m.alt || m.getAttribute('aria-label')).join(',') : [...(layer?.querySelectorAll('img') || [])].map(i => i.alt).join(',')) === name;
  }, { timeout, polling: 10 }, name);
  const space = () => page.keyboard.press('Space');
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  await drop(path.join(work, 'first.png'));
  await drop(seq);
  await setField('간격', '800');
  await drop(path.join(work, 'last.png'));
  assert.deepEqual(await page.$$eval('.card .card-title', t => t.map(x => x.textContent)), ['first', 'seq', 'last']);
  await select('first');
  await present();
  await until('first.png');

  // On a picture Space is the next slide.
  await space();
  await until('01.png');
  // Paused 300 ms into an 800 ms step, it holds; played on, the step ends after the 500 ms it had left.
  await wait(300); await space();
  await wait(1500);
  assert.equal(await shown(), '01.png', 'paused: the step holds');
  const resumed = Date.now(); await space();
  await until('02.mp4', 3000);
  const rest = Date.now() - resumed;
  assert.ok(rest > 300 && rest < 750, `played on with the time it had left (~500 ms): ${rest} ms`);
  // The video step: paused, the video stops where it is and the step holds; played on, it goes on from there.
  await page.waitForFunction(() => { const v = document.querySelector('.presentation-layer[aria-hidden="false"] .sequence-step[style*="visible"] video'); return v && !v.paused && v.currentTime > 0.8; }, { timeout: 5000 });
  await space(); await wait(100);
  const video = () => page.$eval('.presentation-layer[aria-hidden="false"] .sequence-step[style*="visible"] video', v => [v.paused, v.currentTime]);
  const [stopped, at] = await video();
  await wait(3500);
  const [still, later] = await video();
  assert.ok(stopped && still && Math.abs(later - at) < 0.01, `the video stopped at ${at.toFixed(2)} and stayed (${later.toFixed(2)})`);
  assert.equal(await shown(), '02.mp4', 'its step holds past the video’s length');
  await space(); await wait(300);
  const [pausedAgain, after] = await video();
  assert.ok(!pausedAgain && after > at + 0.1, `played on from ${at.toFixed(2)}: ${after.toFixed(2)}`);
  await until('03.png', 4000);
  // Leaving a paused sequence and coming back plays it again from its start.
  await space();
  await page.keyboard.press('ArrowRight'); await until('last.png');
  await page.keyboard.press('ArrowLeft'); await until('01.png');
  await until('02.mp4', 2000);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.presentation-layer', { hidden: true });

  // The slide's auto-advance (1.5 s) waits while paused and then takes the time it had left.
  await select('seq');
  await setField('간격', '5000'); await setField('자동 넘김', '1.5');
  await present();
  await until('01.png');
  await wait(500); await space();
  await wait(2500);
  assert.equal(await shown(), '01.png', 'auto-advance waits while paused');
  const again = Date.now(); await space();
  await until('last.png', 3000);
  const left = Date.now() - again;
  assert.ok(left > 600 && left < 1500, `then advances after the ~1 s it had left: ${left} ms`);
  assert.deepEqual(errors, []);
  console.log(`pause: Space on a picture goes next; on a sequence pauses (step holds, video stops at ${at.toFixed(2)} s) and plays on with the time left (${rest} ms of 500); leaving and coming back plays again; auto-advance waits and resumes (${left} ms of ~1000)`);
} finally {
  await browser.close();
  fs.rmSync(work, { recursive: true, force: true });
}
