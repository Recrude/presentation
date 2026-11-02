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
  // The long list scrolls without a scrollbar: hovering it never narrows the cards.
  const widths = () => page.$eval('.grid', g => [g.clientWidth, g.offsetWidth, Math.round(g.querySelector('.card').getBoundingClientRect().width)]);
  const unhovered = await widths();
  await page.hover('.card:nth-child(2) .thumbnail');
  assert.deepEqual(await widths(), unhovered, 'no scrollbar on hover');
  assert.equal(unhovered[0], unhovered[1], 'no scrollbar at all');
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
  // 넘김 ↔ 격자: five images as a sequence, then all on one sheet in the automatic grid, then back.
  const imageDir = new URL('../../261103-yun/portfolio-images/2025.12-audio-morphology/', import.meta.url).pathname;
  const fs = await import('node:fs');
  const images = fs.readdirSync(imageDir).filter(n => n.endsWith('.webp')).sort().slice(0, 5).map(n => imageDir + n);
  await click('추가');
  const [chooser] = await Promise.all([page.waitForFileChooser(), click('시퀀스')]);
  await chooser.accept(images);
  await page.waitForFunction(() => document.querySelectorAll('.card').length === 94, { timeout: 30000 }); await ready();
  const setNumber = async (label, value) => page.evaluate((label, value) => { const input = [...document.querySelectorAll('.properties label, .properties .field')].find(l => l.textContent.startsWith(label)).querySelector('input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }, label, value);
  await setNumber('간격', '700');
  const arrangement = await page.evaluateHandle(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('배열')).querySelector('select'));
  await arrangement.select('gallery');
  await page.waitForFunction(() => document.querySelectorAll('.preview .photo-placement').length === 5 && !document.querySelector('.preview .sequence-step'));
  assert.equal(await page.$$eval('.properties label', ls => ls.some(l => l.textContent.startsWith('간격'))), false, 'grid has no timing fields');
  const boxes = await page.$$eval('.preview .photo-placement', ps => ps.map(p => Math.round(p.getBoundingClientRect().height)));
  assert.equal(new Set(boxes).size, 1, 'one height in the automatic grid');
  await (await page.evaluateHandle(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('배열')).querySelector('select'))).select('sequence');
  await page.waitForFunction(() => document.querySelector('.preview .sequence-step'));
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('간격')).querySelector('input').value), '700', 'timing is kept');

  // Grid options on the image slide: one height (rows) by default for new slides, equal gaps.
  const option = (label, value) => page.evaluate((label, value) => { const s = [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith(label)).querySelector('select'); s.value = value; s.dispatchEvent(new Event('change', { bubbles: true })); }, label, value);
  await (await page.evaluateHandle(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('배열')).querySelector('select'))).select('gallery');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.properties label')].find(l => l.textContent.startsWith('정렬')).querySelector('select').value), 'rows', 'new image slides default to one height');
  const heights = await page.$$eval('.preview .photo-placement', ps => ps.map(p => Math.round(p.getBoundingClientRect().height)));
  assert.equal(new Set(heights).size, 1, 'one height');
  await option('맞춤', 'cover');
  assert.equal(await page.$eval('.preview .photo-placement img', i => getComputedStyle(i).objectFit), 'cover');
  // Outer margin: a portfolio page and a Safari window inset by 120 px of the 1920 sheet.
  const inset = async () => page.$eval('.preview', box => {
    const sheet = box.querySelector('.slide-sheet').getBoundingClientRect(), unit = sheet.width / 1920;
    const inner = (box.querySelector('.slide-inset') || box.querySelector('.browser-window')).getBoundingClientRect();
    return [inner.left - sheet.left, inner.top - sheet.top, sheet.right - inner.right, sheet.bottom - inner.bottom].map(v => Math.round(v / unit));
  });
  for (const kind of ['image', 'web']) {
    const n = await page.$$eval('.card .card-title', (titles, kind) => titles.findIndex(t => (kind === 'image' ? /\d{4}\.\d{2} · /.test(t.textContent) : t.textContent === 'VED')), kind) + 1;
    await page.$eval(`.card:nth-child(${n}) .thumbnail`, e => e.click());
    if (kind === 'web') {
      await page.evaluate(() => { const box = [...document.querySelectorAll('.properties label')].find(l => l.textContent.includes('브라우저 창')).querySelector('input'); if (!box.checked) box.click(); });
      await page.waitForSelector('.preview .browser-window');
      assert.deepEqual(await inset(), [48, 48, 48, 48], 'the Safari window keeps 48 by default');
    }
    await setNumber('바깥 여백', '120');
    assert.deepEqual(await inset(), [120, 120, 120, 120], `${kind} margin`);
  }
  // Each side: ▾ opens 위·아래·왼쪽·오른쪽 under 바깥 여백; a slide with different sides opens with them.
  const sideFields = () => page.$$eval('.margin-sides label', ls => ls.map(l => [l.textContent, l.querySelector('input').value]));
  const cardOf = kind => page.$$eval('.card .card-title', (titles, kind) => titles.findIndex(t => (kind === 'image' ? /\d{4}\.\d{2} · /.test(t.textContent) : t.textContent === 'VED')), kind).then(i => i + 1);
  assert.deepEqual(await sideFields(), [], 'closed by default');
  await page.click('.margin-toggle');
  assert.deepEqual(await sideFields(), [['위', '120'], ['아래', '120'], ['왼쪽', '120'], ['오른쪽', '120']]);
  await setNumber('위', '200'); await setNumber('왼쪽', '300');
  assert.deepEqual(await inset(), [300, 200, 120, 120], 'Safari window: left 300, top 200');
  assert.equal(await page.$eval('.field input[aria-label="바깥 여백"]', i => [i.value, i.placeholder].join()), ',각각');
  await page.$eval(`.card:nth-child(${await cardOf('image')}) .thumbnail`, e => e.click());
  assert.deepEqual(await sideFields(), [], 'a slide with one margin opens closed');
  await page.click('.margin-toggle');
  await setNumber('아래', '0');
  assert.deepEqual(await inset(), [120, 120, 120, 0], 'page: bottom 0');
  await page.$eval(`.card:nth-child(${await cardOf('web')}) .thumbnail`, e => e.click());
  assert.deepEqual(await sideFields(), [['위', '200'], ['아래', '120'], ['왼쪽', '300'], ['오른쪽', '120']], 'different sides open by themselves');
  await setNumber('위', '120'); await setNumber('왼쪽', '120');
  assert.equal(await page.$eval('.field input[aria-label="바깥 여백"]', i => i.value), '120', 'equal sides become one value again');
  // The columns line up: every input in the panel's grid ends on its column's right edge.
  const edges = await page.$$eval('.properties .number-fields input', is => is.map(i => Math.round(i.getBoundingClientRect().right)));
  const firstRow = await page.$$eval('.margin-sides input', is => is.map(i => Math.round(i.getBoundingClientRect().right)));
  assert.equal(new Set(firstRow).size, 2, 'sides in two columns');
  assert.ok(firstRow.every(x => edges.filter(e => e === x).length >= 2), 'side inputs align with the fields above');
  await setNumber('바깥 여백', '');
  assert.deepEqual(await inset(), [48, 48, 48, 48], 'empty is the default again');

  // Duplicating: ⌘D copies the text slide right after it and picks the copy; editing the copy leaves
  // the original; ⌘D inside the text field types nothing special; two picked slides copy as a block.
  const count = async () => (await cards()).length;
  const textAt = await page.$$eval('.card .card-title', ts => ts.findIndex(t => t.textContent === '텍스트')) + 1;
  await page.$eval(`.card:nth-child(${textAt}) .thumbnail`, e => e.click());
  await page.waitForSelector('.text-editor');
  const before = await count();
  await page.keyboard.down('Meta'); await page.keyboard.press('KeyD'); await page.keyboard.up('Meta');
  list = await cards();
  assert.equal(list.length, before + 1, '⌘D adds one');
  assert.deepEqual([list[textAt - 1].title, list[textAt].title], ['텍스트', '텍스트']);
  assert.ok(list[textAt].picked && !list[textAt - 1].picked, 'the copy is picked');
  assert.equal(await page.$eval('.text-editor', e => e.value), '11/3 첫 장');
  await page.click('.text-editor', { clickCount: 3 }); await page.keyboard.press('End'); await page.type('.text-editor', ' 사본');
  await page.keyboard.down('Meta'); await page.keyboard.press('KeyD'); await page.keyboard.up('Meta');
  assert.equal(await count(), before + 1, '⌘D in the text field does not duplicate');
  await page.$eval(`.card:nth-child(${textAt}) .thumbnail`, e => e.click());
  assert.equal(await page.$eval('.text-editor', e => e.value), '11/3 첫 장', 'the original keeps its text');
  await page.$eval(`.card:nth-child(${textAt + 1}) .thumbnail`, e => e.click());
  assert.equal(await page.$eval('.text-editor', e => e.value), '11/3 첫 장 사본');
  await page.click(`.card:nth-child(1) .thumbnail`);
  await page.keyboard.down('Shift'); await page.click(`.card:nth-child(2) .thumbnail`); await page.keyboard.up('Shift');
  const pair = (await cards()).slice(0, 2).map(c => c.title);
  await click('복제');
  list = await cards();
  assert.equal(list.length, before + 3);
  assert.deepEqual(list.slice(0, 4).map(c => c.title), [...pair, ...pair], 'a block of two after the second');
  assert.deepEqual(list.slice(0, 4).map(c => c.picked), [false, false, true, true], 'the copies are picked');
  await click('되돌리기');
  assert.equal(await count(), before + 1, 'undo removes the copies');

  // Per-image seconds: 0.3 s, 1.2 s and the slide's 700 ms interval for the third, measured in the live preview.
  const total = await count();
  await click('추가');
  const [seqChooser] = await Promise.all([page.waitForFileChooser(), click('시퀀스')]);
  await seqChooser.accept(images.slice(0, 3));
  await page.waitForFunction(n => document.querySelectorAll('.card').length === n, { timeout: 30000 }, total + 1); await ready();
  await setNumber('간격', '700');
  const setDuration = (i, value) => page.evaluate((i, value) => { const input = document.querySelectorAll('.photo-row input')[i]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); }, i, value);
  assert.deepEqual(await page.$$eval('.photo-row input', is => is.map(i => i.placeholder)), ['0.7', '0.7', '0.7'], 'empty shows the interval');
  await setDuration(0, '0.3'); await setDuration(1, '1.2');
  await click('미리보기');
  const changes = await page.evaluate(() => new Promise(resolve => {
    const seen = [], start = performance.now();
    const tick = () => {
      const shown = [...document.querySelectorAll('.preview .sequence-step')].find(s => s.style.visibility === 'visible')?.querySelector('img')?.alt;
      if (shown && shown !== seen.at(-1)?.[1]) seen.push([performance.now(), shown]);
      if (performance.now() - start < 5200) requestAnimationFrame(tick); else resolve(seen);
    };
    tick();
  }));
  const names = images.slice(0, 3).map(f => f.split('/').pop()), expected = { [names[0]]: 300, [names[1]]: 1200, [names[2]]: 700 };
  const held = changes.slice(1, -1).map(([t, name], i) => [name, Math.round(changes[i + 2][0] - t)]);
  assert.ok(held.length >= 4, `enough steps: ${JSON.stringify(held)}`);
  for (const [name, ms] of held) assert.ok(Math.abs(ms - expected[name]) < 120, `${name} held ${ms} ms, expected ${expected[name]}`);
  await click('미리보기 닫기');

  assert.deepEqual(errors, []);
  console.log('arrange: per-image seconds in a sequence; per-side margins; ⌘D and 복제 copy after the picked slides, the copy edits apart, undo; 격자 rows by default, cover, 120 margin on a page and a Safari window; 넘김 ↔ 격자 switch keeps timing; 92 slides imported hidden, 4-slide block and far single drag with autoscroll, batch show, saved order');
} finally {
  await browser.close();
}
