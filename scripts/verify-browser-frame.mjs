// Browser window toolbar color: the capture's reader (pageToolbarColor) on pages built for each rule (light
// theme-color, else the body background), then the editor: adding a web link captures it (local Chrome) and
// the window takes that color in the viewer's light and dark schemes alike.
// Needs the dev server on 3100, Google Chrome and network access to r777-dice-roll.vercel.app and ved.kr.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { pageToolbarColor } from '../api/capture.mjs';
const base = 'http://127.0.0.1:3100/presentations/';
// [name, page, color]: the same color whatever the viewer's color scheme (always read for light).
const pages = [
  ['theme-color wins over everything', '<meta name="theme-color" content="#38ad6d"><body style="background:#123456">', '#38ad6d'],
  ['theme-color for light, not dark', '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111111"><meta name="theme-color" content="rgb(250 250 0)">', '#fafa00'],
  ['no theme-color: the body background, not a header along the top', '<body style="margin:0;background:#fff"><header style="height:80px;background:#0e1012"></header>', '#ffffff'],
  ['the body over a differently colored root (ved.kr)', '<html style="background:#38ad6d"><body style="background:rgb(233 236 237)">', '#e9eced'],
  ['a transparent body falls back to the root', '<html style="background:#0e1012"><body>x', '#0e1012'],
  ['a half-transparent body over white', '<body style="background:rgba(0,0,0,.5)">x', '#7f7f7f'],
  ['body color through its margin', '<body style="background:#222">x', '#222222'],
  ['dark-only styles are not read', '<style>@media (prefers-color-scheme: dark){body{background:#000}}</style><body style="background:#fafafa">', '#fafafa'],
  ['nothing set is white', '<p>plain', '#ffffff'],
];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  // The capture always reads the light scheme (see capture in api/capture.mjs).
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  for (const [name, html, color] of pages) {
    await page.setContent('<!doctype html>' + html);
    assert.equal(await page.evaluate(pageToolbarColor), color, name);
  }
  console.log(`toolbar color rules: ${pages.length} pages`);

  // Editor: a new web link is captured and its window takes Safari's color (r777: white).
  const editor = await browser.newPage();
  await editor.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  editor.on('pageerror', e => errors.push(e.message));
  await editor.setRequestInterception(true);
  editor.on('request', req => new URL(req.url()).pathname.includes('/decks/2026-11-03') ? req.respond({ status: 404, body: '{}' }) : req.continue());
  await editor.goto(base + 'edit/261103-yun/');
  await editor.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const click = async label => { await editor.waitForFunction(label => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === label && !b.disabled), { timeout: 30000 }, label); await editor.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label && !b.disabled).click(), label); };
  await click('추가');
  await editor.type('[aria-label="웹 또는 영상 주소"]', 'https://r777-dice-roll.vercel.app/');
  await click('링크 추가');
  await editor.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('캡처 완료'), { timeout: 90000 });
  const frame = () => editor.$eval('.preview .browser-window', e => ({ tint: e.style.getPropertyValue('--tint'), light: e.classList.contains('is-light'), host: e.querySelector('.browser-host').textContent }));
  assert.deepEqual(await frame(), { tint: '#ffffff', light: true, host: 'r777-dice-roll.vercel.app' });
  await editor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  assert.equal((await frame()).tint, '#ffffff', 'the light color in a dark viewer too');
  await editor.screenshot({ path: process.env.VERIFY_OUT ? process.env.VERIFY_OUT + '/frame-r777.png' : '/dev/null' });
  // ved.kr has no theme-color: its body background (light gray), not the green root.
  await editor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await click('추가');
  await editor.type('[aria-label="웹 또는 영상 주소"]', 'https://ved.kr/');
  await click('링크 추가');
  await editor.waitForFunction(() => document.querySelector('.preview .browser-host')?.textContent === 'ved.kr' && document.querySelector('[role=status]')?.textContent.includes('캡처 완료'), { timeout: 90000 });
  assert.equal((await frame()).tint, '#e9eced', 'ved.kr: body background');
  assert.deepEqual(errors, []);
  console.log('editor: r777 #ffffff in light and dark viewers, ved.kr #e9eced (body, not the green root)');
} finally {
  await browser.close();
}
