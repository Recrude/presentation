// Presenter window: with a second display (emulated with --screen-info) and 창 관리 allowed, 발표 puts the
// slides full screen and opens the presenter window on the laptop's screen from the same click. It shows
// n / N, the time, the slide on screen and the next one; its keys move the talk; text slides set in the same
// faces at the same places; Esc there ends the talk and closes it. One display, or no permission: full
// screen as before and no window. Needs the dev server on 3100, Google Chrome and the composite fonts in
// ~/Library/Fonts and /Library/Fonts; the 9/9 deck starts from its originals (published file answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogEntries } from '../app/catalog.ts';
const origin = 'http://127.0.0.1:3100', base = origin + '/presentations/';
const screens = `{0,0 1728x1117 label='Built-in' isInternal=1}{1728,0 1920x1080 label='External'}`;
const fontDir = path.join(os.homedir(), 'Library/Fonts');
const userFont = name => fs.readFileSync(path.join(fontDir, fs.readdirSync(fontDir).find(n => n.normalize('NFC') === name)));
const fonts = {
  'SM3SJGothic-03': userFont('SM3신중고딕-03.otf'), 'SFProDisplay-Regular': fs.readFileSync('/Library/Fonts/SF-Pro-Display-Regular.otf'),
  'SM3KGothic-Regular': userFont('SM3견출고딕-Regular.otf'), 'Pretendard-Bold': userFont('Pretendard-Bold.otf'),
  'SuisseIntl-SemiBold': userFont('SuisseIntl-SemiBold.otf'), 'SuisseIntl-SemiBoldItalic': userFont('SuisseIntl-SemiBoldItalic.otf'),
};
const registry = { version: 1, items: catalogEntries.map(e => ({ id: e.id, public: true })) };
const pause = ms => new Promise(r => setTimeout(r, ms));

async function launch({ twoScreens, allowed }) {
  const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox', ...twoScreens ? [`--screen-info=${screens}`] : []] });
  if (allowed) await (await browser.target().createCDPSession()).send('Browser.grantPermissions', { origin, permissions: ['windowManagement'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = new URL(req.url());
    if (url.pathname.endsWith('/decks/catalog.json')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(registry) });
    if (url.pathname.endsWith('/deck.json')) return req.respond({ status: 404, contentType: 'application/json', body: '{}' });
    return req.continue();
  });
  return { browser, page, errors };
}
const ready = page => page.waitForFunction(() => document.querySelector('.card') && !document.querySelector('.workspace[inert]'), { timeout: 60000 });
// A real click (trusted, so it carries the user activation full screen and the window need).
async function present(page) {
  for (const b of await page.$$('.toolbar button')) if ((await b.evaluate(e => e.textContent.trim())) === '발표') return b.click();
  throw Error('no 발표 button');
}
const shown = page => page.evaluate(() => document.querySelector('.presentation-layer[aria-hidden="false"] img')?.src);
const presenterState = popup => popup.evaluate(() => {
  const [now, next] = document.querySelectorAll('.presenter-sheet');
  return {
    text: [...document.querySelectorAll('.presenter > p, .presenter-next > p')].map(p => p.textContent),
    now: now?.querySelector('img')?.src, next: document.querySelector('.presenter-next .presenter-sheet img')?.src,
    bounds: [screenX, screenY, outerWidth, outerHeight],
  };
});
// Esc closes the window as it goes down, so only the key down is sent there.
const escape = popup => popup.keyboard.down('Escape').catch(e => { if (!popup.isClosed()) throw e; });
async function presenterWindow(browser, page) {
  const target = await browser.waitForTarget(t => t.opener() === page.target(), { timeout: 10000 });
  const popup = await target.page();
  await popup.waitForSelector('.presenter .presenter-sheet .slide-sheet');
  return popup;
}

// Two displays, 창 관리 allowed: the 9/9 originals.
{
  const { browser, page, errors } = await launch({ twoScreens: true, allowed: true });
  try {
    await page.goto(base + 'edit/260909-ahn/');
    await ready(page);
    await page.waitForFunction(() => document.querySelectorAll('.card').length === 79);
    await present(page);
    const popup = await presenterWindow(browser, page);
    assert.ok(await page.evaluate(() => !!document.fullscreenElement), 'the slides are full screen');
    await page.waitForFunction(() => document.querySelector('.presentation-layer[aria-hidden="false"] img')?.complete);
    let p = await presenterState(popup);
    assert.deepEqual(p.bounds.slice(0, 3), [0, 0, 1728], 'the window fills the laptop’s screen');
    assert.equal(p.text[0], '1 / 79');
    assert.match(p.text[1], /^0:0\d$/, 'the time since the start');
    assert.equal(p.now, await shown(page), 'the slide on screen');
    assert.ok(p.next && p.next !== p.now, 'and the next one');
    assert.equal(p.text[2], '다음');
    if (process.env.VERIFY_OUT) await popup.screenshot({ path: `${process.env.VERIFY_OUT}/presenter-images.png` });
    const second = p.next;
    // Keys in the presenter window move the talk.
    await popup.keyboard.press('ArrowRight');
    await page.waitForFunction(src => document.querySelector('.presentation-layer[aria-hidden="false"] img')?.src === src, { timeout: 10000 }, second);
    p = await presenterState(popup);
    assert.deepEqual([p.text[0], p.now], ['2 / 79', second]);
    await popup.keyboard.press('End');
    await popup.waitForFunction(() => document.querySelector('.presenter > p').textContent === '79 / 79');
    p = await presenterState(popup);
    assert.deepEqual([p.next, p.text[2]], [undefined, '마지막 장표']);
    await pause(1100);
    assert.match((await presenterState(popup)).text[1], /^0:0[1-9]$/, 'the time runs');
    // Esc there ends the talk: full screen ends and the window closes.
    await escape(popup);
    await page.waitForFunction(() => !document.querySelector('.presentation') && !document.fullscreenElement, { timeout: 10000 });
    await pause(300);
    assert.ok(popup.isClosed(), 'the presenter window closes');
    assert.equal(await page.evaluate(() => document.querySelector('.card.selected')?.dataset.slideId), await page.evaluate(() => [...document.querySelectorAll('.card:not(.hidden-slide)')].at(-1).dataset.slideId), 'the editor keeps where the talk got to');
    // Closing the window by hand leaves the slides full screen.
    await present(page);
    const again = await presenterWindow(browser, page);
    await again.close();
    await pause(300);
    assert.ok(await page.evaluate(() => !!document.fullscreenElement && !!document.querySelector('.presentation')), 'the slides stay');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}

// Text slides: the window has the composite's faces, so the type sits where it does on the slides.
{
  const { browser, page, errors } = await launch({ twoScreens: true, allowed: true });
  try {
    await page.goto(base + 'edit/261103-yun/');
    await page.waitForSelector('.toolbar');
    for (const [name, bytes] of Object.entries(fonts)) await page.evaluate(async (name, b64) => {
      const cache = await caches.open('presentation-fonts-v1');
      await cache.put(new Request(new URL('/presentation-fonts/' + name, location.origin)), new Response(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));
    }, name, bytes.toString('base64'));
    await page.reload();
    await page.waitForSelector('.toolbar');
    await page.waitForFunction(() => !document.querySelector('.workspace[inert]'));
    const button = (label, scope = '') => page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(b => b.textContent.trim() === label && !b.disabled).click(), label, scope);
    for (const text of ['김재연 동작하는 것\n\nVisual Engineering', 'Seoul 2026 · 다음 장표']) {
      await button('추가', '.toolbar'); await button('텍스트');
      await page.waitForSelector('.text-editor');
      await page.focus('.text-editor');
      await page.keyboard.type(text);
    }
    await page.click('.card');
    await present(page);
    const popup = await presenterWindow(browser, page);
    await popup.waitForSelector('.presenter .text-body [data-run]');
    await pause(800);
    // Each run's box on its sheet, in sheet widths: the same on the slides and in the window.
    const runs = (sheet) => [...document.querySelectorAll(sheet)].map(sheet => {
      const box = sheet.querySelector('.slide-sheet').getBoundingClientRect();
      return [...sheet.querySelectorAll('[data-run]')].map(span => { const r = span.getBoundingClientRect(); return [r.left - box.left, r.top - box.top, r.right - box.left].map(v => +(v / box.width).toFixed(4)); });
    });
    const onScreen = (await page.evaluate(runs, '.presentation-layer[aria-hidden="false"]'))[0];
    const [now, next] = await popup.evaluate(runs, '.presenter-sheet');
    assert.ok(onScreen.length >= 2, 'runs measured');
    onScreen.flat().forEach((v, i) => assert.ok(Math.abs(v - now.flat()[i]) < 0.002, `run ${i}: ${v} on the slides, ${now.flat()[i]} in the window`));
    assert.ok(next.length > 0, 'the next text slide shows');
    if (process.env.VERIFY_OUT) await popup.screenshot({ path: `${process.env.VERIFY_OUT}/presenter-text.png` });
    const faces = await popup.evaluate(() => [...document.fonts].length);
    assert.ok(faces > 0, 'the window has the faces');
    await escape(popup);
    await page.waitForFunction(() => !document.querySelector('.presentation'), { timeout: 10000 });
    assert.deepEqual(errors, []);
    console.log(`text runs on the slides and in the window agree within 0.2% of the sheet (${onScreen.length} runs, ${faces} faces in the window)`);
  } finally { await browser.close(); }
}

// One display, or two without the permission: full screen as before, no window.
for (const setup of [{ twoScreens: false, allowed: true }, { twoScreens: true, allowed: false }]) {
  const { browser, page, errors } = await launch(setup);
  try {
    await page.goto(base + 'edit/260909-ahn/');
    await ready(page);
    const pages = (await browser.pages()).length;
    await present(page);
    await page.waitForFunction(() => !!document.fullscreenElement && !!document.querySelector('.presentation'), { timeout: 10000 });
    await pause(800);
    assert.equal((await browser.pages()).length, pages, `no presenter window (${JSON.stringify(setup)})`);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.present-controls span')?.textContent.startsWith('2 /'));
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
}
console.log('presenter: two displays → slides full screen + presenter window (n / N, time, now, next; keys there move the talk; Esc ends it; closing it keeps the slides); one display or no permission → full screen only');
