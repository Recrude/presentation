// Arranging a deck: another presentation's slides come in hidden at the end, several slides are picked
// (Shift/⌘ click) and dragged together, a far slide is dragged up while the list scrolls, and the
// order survives a reload. Needs the dev server on 3100 and Google Chrome; the 9/9 deck is the
// published one in public/decks, the 11/3 deck starts empty (its published file is answered 404).
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:3100/presentations/';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', req => new URL(req.url()).pathname.includes('/decks/2026-11-03-yoon-jaeyoung-graduation-project/') ? req.respond({ status: 404, body: '{}' }) : req.continue());
  const ready = () => page.waitForFunction(() => !document.querySelector('.workspace[inert]'), { timeout: 60000 });
  const click = label => page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim().replace(/ \*$/, '') === label && !b.disabled).click(), label);
  const status = text => page.waitForFunction(text => document.querySelector('[role=status]')?.textContent.includes(text), { timeout: 30000 }, text);
  const cards = () => page.$$eval('.card', cs => cs.map(c => ({ title: c.querySelector('.card-title').textContent, hidden: c.classList.contains('hidden-slide'), picked: c.classList.contains('selected') })));
  // Thumbnail point at the list's current scroll position (dx: 0 = left edge, 1 = right edge).
  const center = async (n, dx = 0.5) => page.$eval(`.card:nth-child(${n}) .thumbnail`, (e, dx) => { const r = e.getBoundingClientRect(); return [r.left + r.width * dx, r.top + r.height / 2]; }, dx);

  await page.goto(base + 'edit/261103-yun/');
  await page.waitForSelector('.toolbar'); await ready();
  await click('추가'); await click('텍스트');
  await page.type('.text-editor', '11/3 첫 장');
  await click('추가');
  await page.waitForFunction(() => document.querySelector('[aria-label="가져올 발표"]')?.value === '2026-09-09-ahn-byunghak-graduation-project', { timeout: 15000 });
  await click('장표 숨김으로 가져오기');
  await status('92장을 숨김으로');
  let list = await cards();
  assert.equal(list.length, 93);
  assert.equal(list.filter(c => c.hidden).length, 92, 'all imported slides are hidden');
  assert.ok(!list[0].hidden, 'the 11/3 slide stays first and shown');
  await click('장표 숨김으로 가져오기');
  await status('이미 모두 가져온');
  assert.equal((await cards()).length, 93, 'a second import adds nothing');

  // Pick cards 5–7 with Shift, add 10 with ⌘, then drag the block before the first card.
  await page.click('.card:nth-child(5) .thumbnail');
  await page.keyboard.down('Shift'); await page.click('.card:nth-child(7) .thumbnail'); await page.keyboard.up('Shift');
  await page.keyboard.down('Meta'); await page.click('.card:nth-child(10) .thumbnail'); await page.keyboard.up('Meta');
  list = await cards();
  const picked = list.filter(c => c.picked).map(c => c.title);
  assert.deepEqual(picked, [list[4].title, list[5].title, list[6].title, list[9].title]);
  assert.match(await page.$eval('.properties .picked', e => e.textContent), /4장 선택/);
  await page.$eval('.grid', g => { g.scrollTop = 0; });
  const [fx, fy] = await center(6), [tx, ty] = await center(1, 0.2);
  await page.mouse.move(fx, fy); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(fx + (tx - fx) * i / 12, fy + (ty - fy) * i / 12);
  assert.ok(await page.$('.drag-ghost'), 'a ghost follows the pointer');
  assert.match(await page.$eval('.drag-ghost', e => e.textContent), /4장/);
  await page.mouse.up();
  assert.equal(await page.$('.drag-ghost'), null, 'the ghost goes away');
  list = await cards();
  assert.deepEqual(list.slice(0, 4).map(c => c.title), picked, 'the block lands first, in deck order');
  assert.equal(list[4].title, '텍스트');
  await click('표시');
  list = await cards();
  assert.deepEqual(list.slice(0, 4).map(c => c.hidden), [false, false, false, false], 'batch show');

  // A single far card: drag the last one up; the list scrolls while the pointer waits above it.
  await page.click('.card:nth-child(1) .thumbnail');
  const last = list.at(-1).title;
  await page.$eval('.card:nth-child(93)', e => e.scrollIntoView({ block: 'center' }));
  const [lx, ly] = await center(93);
  await page.mouse.move(lx, ly); await page.mouse.down();
  await page.mouse.move(lx, ly - 20); await page.mouse.move(lx, ly - 60);
  const gridTop = await page.$eval('.grid', g => g.getBoundingClientRect().top);
  await page.mouse.move(lx, gridTop + 10);
  await page.waitForFunction(() => document.querySelector('.grid').scrollTop === 0, { timeout: 20000 });
  const [sx, sy] = await page.$eval('.card:nth-child(2) .thumbnail', e => { const r = e.getBoundingClientRect(); return [r.left + r.width * 0.2, r.top + r.height / 2]; });
  await page.mouse.move(sx, sy, { steps: 6 });
  await page.mouse.up();
  list = await cards();
  assert.equal(list[1].title, last, 'the far card lands second');
  assert.equal(list.length, 93);

  await click('저장'); await status('이 브라우저에 저장됨');
  await page.reload(); await page.waitForSelector('.toolbar'); await ready();
  const reloaded = await cards();
  assert.deepEqual(reloaded.map(c => [c.title, c.hidden]), list.map(c => [c.title, c.hidden]), 'order and hidden state are saved');
  // Imported originals still show their images.
  await page.$eval('.card:nth-child(3) .thumbnail', e => e.scrollIntoView());
  await page.waitForFunction(() => [...document.querySelectorAll('.card:nth-child(-n+4) .thumbnail img')].some(i => i.complete && i.naturalWidth > 0), { timeout: 20000 });
  assert.deepEqual(errors, []);
  console.log('arrange: 92 slides imported hidden, 4-slide block and far single drag with autoscroll, batch show, saved order');
} finally {
  await browser.close();
}
