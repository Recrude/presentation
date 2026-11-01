// Safari window toolbar color: the capture's reader (pageToolbarColor) on pages built for each rule, then
// the editor: adding a web link captures it (local Chrome) and the window takes the page's color.
// Needs the dev server on 3100, Google Chrome and network access to r777-dice-roll.vercel.app.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { pageToolbarColor } from '../api/capture.mjs';
const base = 'http://127.0.0.1:3100/presentations/';
const pages = [
  ['theme-color wins over everything', '<meta name="theme-color" content="#38ad6d"><body style="background:#123456">', '#38ad6d'],
  ['theme-color for the current scheme', '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111111"><meta name="theme-color" content="rgb(250 250 0)">', '#fafa00', '#111111'],
  ['solid header along the top', '<body style="margin:0;background:#fff"><header style="height:80px;background:#0e1012"></header>', '#0e1012'],
  ['two-tone top falls back to the page', '<body style="margin:0;background:#fefefe"><div style="display:flex;height:80px"><i style="flex:1;background:red"></i><i style="flex:1;background:blue"></i></div>', '#fefefe'],
  ['fixed header is ignored', '<body style="margin:0;background:#ddeeff"><div style="position:fixed;top:0;left:0;right:0;height:60px;background:#000"></div>', '#ddeeff'],
  ['background image is ignored', '<body style="margin:0"><div style="height:45px;background:url(data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E) #00aa00"></div>', '#ffffff'],
  ['body color fills the canvas through its margin', '<body style="background:#222">x', '#222222'],
  ['one corner element at an end is left out', '<body style="margin:0;background:#f0f0f0"><span style="position:absolute;top:0;right:0;width:20px;height:20px;background:#000"></span>', '#f0f0f0'],
  ['nothing set is white', '<p>plain', '#ffffff'],
];
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  for (const [name, html, light, dark = light] of pages) {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.setContent('<!doctype html>' + html);
    assert.equal(await page.evaluate(pageToolbarColor), light, name);
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    assert.equal(await page.evaluate(pageToolbarColor), dark, name + ' (dark)');
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
  const click = label => editor.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label && !b.disabled).click(), label);
  await click('추가');
  await editor.type('[aria-label="웹 또는 영상 주소"]', 'https://r777-dice-roll.vercel.app/');
  await click('링크 추가');
  await editor.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('캡처 완료'), { timeout: 90000 });
  const frame = () => editor.$eval('.preview .browser-window', e => ({ tint: e.style.getPropertyValue('--tint'), light: e.classList.contains('is-light'), host: e.querySelector('.browser-host').textContent }));
  assert.deepEqual(await frame(), { tint: '#ffffff', light: true, host: 'r777-dice-roll.vercel.app' });
  await editor.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  assert.equal((await frame()).tint, '#ffffff', 'r777 has no dark theme');
  await editor.screenshot({ path: process.env.VERIFY_OUT ? process.env.VERIFY_OUT + '/frame-r777.png' : '/dev/null' });
  assert.deepEqual(errors, []);
  console.log('editor: new web link captured, window toolbar #ffffff (light)');
} finally {
  await browser.close();
}
