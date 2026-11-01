import test from 'node:test';
import assert from 'node:assert/strict';
import { validDeck, assetIds, defaultTypography, assetTypes, isFormat, sheetHeight, layoutPhotos, FORMATS } from '../app/model.ts';
import { runs, paragraphs, styleOf, runStyles, fontsIn, styleSample, COMPOSITES } from '../app/composite.ts';
const photo = id => ({ id, name: id + '.webp', width: 1600, height: 900 });
const text = { id: 't', title: 'T', kind: 'text', src: '', hidden: false, text: '가 A', typo: { ...defaultTypography } };
const sequence = { id: 's', title: 'S', kind: 'sequence', src: '', hidden: false, photos: [photo('a'), photo('b'), photo('c')], interval: 400, end: 'loop' };
const clip = { id: 'c', title: 'C', kind: 'clip', src: '', hidden: false, media: photo('m'), previewId: 'poster', end: 'next' };
const web = { id: 'w', title: 'W', kind: 'web', src: 'https://ved.kr/', hidden: false, frame: 'browser' };

test('text, sequence, clip and framed web slides validate with timing options', () => {
  assert.ok(validDeck([text, sequence, clip, web]));
  assert.ok(validDeck([{ ...text, advance: 1.5, transition: 'dissolve' }, { ...sequence, perFrame: 4, end: 'next' }]));
  assert.deepEqual(assetIds([text, sequence, clip]), ['a', 'b', 'c', 'm', 'poster']);
});

test('invalid timing, typography and frame values are rejected', () => {
  for (const bad of [
    { ...text, typo: undefined }, { ...text, typo: { ...defaultTypography, size: 0 } }, { ...text, typo: { ...defaultTypography, left: 1000, right: 900 } },
    { ...text, text: 'x'.repeat(10001) }, { ...text, advance: 0 }, { ...text, transition: 'wipe' },
    { ...sequence, interval: 10 }, { ...sequence, end: 'bounce' }, { ...sequence, perFrame: 13 }, { ...sequence, photos: [] },
    { ...clip, media: undefined }, { ...clip, end: undefined }, { ...web, frame: 'chrome' }, { ...sequence, frame: 'browser' },
  ]) assert.equal(validDeck([bad]), false, JSON.stringify(bad).slice(0, 80));
});

test('composite runs follow the InDesign slots: Hangul/CJK quotes in SM3 at 99%, Latin and digits in SF Pro shifted down', () => {
  const r = runs('디자인 Visual 2026년 “제품” ×');
  const style = s => runStyles[r.find(x => x.text.includes(s)).style];
  assert.deepEqual(style('디자인'), { font: 'SM3SJGothic-03', scale: 0.99, shift: 0, hscale: 1, bold: false });
  assert.deepEqual(style('Visual'), { font: 'SFProDisplay-Regular', scale: 1, shift: 0.05, hscale: 1, bold: false });
  assert.deepEqual(style('“'), { font: 'SM3SJGothic-03', scale: 0.99, shift: 0, hscale: 1, bold: false });
  assert.deepEqual(style('×'), { font: 'SFProDisplay-Regular', scale: 1, shift: 0, hscale: 1, bold: false });
  assert.deepEqual(runStyles[styleOf('一'.codePointAt(0))], { font: 'SM3SJGothic-03', scale: 1, shift: 0, hscale: 1, bold: false }, 'unlisted characters use the base font');
  assert.equal(r.map(x => x.text).join(''), '디자인 Visual 2026년 “제품” ×');
  assert.deepEqual(paragraphs('첫 줄\n같은 문단\n\n\n둘째\n \n셋째\n'), ['첫 줄\n같은 문단', '둘째', '셋째']);
});

test('**bold** uses the 볼드 composite: SM3견출고딕 98% 장평, Pretendard Bold punctuation, Suisse Semi Bold Latin 103% lowered 0.08em', () => {
  const r = runs('본문 **강조 Bold “말”** 본문');
  const style = s => runStyles[r.find(x => x.text.includes(s)).style];
  assert.deepEqual(style('강조'), { font: 'SM3KGothic-Regular', scale: 1, shift: 0.01, hscale: 0.98, bold: true });
  assert.deepEqual(style('Bold'), { font: 'SuisseIntl-SemiBold', scale: 1.03, shift: 0.08, hscale: 0.99, bold: true });
  assert.deepEqual(style('“'), { font: 'Pretendard-Bold', scale: 1.03, shift: 0.04, hscale: 1, bold: true });
  assert.equal(runStyles[r.at(-1).style].bold, false);
  assert.equal(r.map(x => x.text).join(''), '본문 강조 Bold “말” 본문');
  assert.equal(runs('a**b').map(x => x.text).join(''), 'a**b', 'an unmatched marker stays as typed');
  assert.deepEqual(fontsIn('본문\n\n**굵게**'), ['SM3SJGothic-03', 'SM3KGothic-Regular']);
  assert.ok(runStyles.every((_, i) => runStyles[styleOf(styleSample(i).codePointAt(0), runStyles[i].bold)] === runStyles[i]), 'every style has a probe character');
});

test('asset table has no inherited keys', () => {
  assert.equal(assetTypes.constructor, undefined);
  assert.equal(assetTypes['image/svg+xml'], 'svg');
});

test('a slide set in the 볼드 composite stays bold; ** cannot switch it back', () => {
  assert.ok(validDeck([{ ...text, typo: { ...defaultTypography, composite: 'bold' } }]));
  assert.equal(validDeck([{ ...text, typo: { ...defaultTypography, composite: 'italic' } }]), false);
  assert.ok(runs('본문 **강조** Latin', true).every(r => runStyles[r.style].bold));
  assert.equal(runs('본문 **강조** Latin', true).map(r => r.text).join(''), '본문 강조 Latin');
  assert.deepEqual(fontsIn('가 A', true), ['SM3KGothic-Regular', 'SuisseIntl-SemiBold']);
  assert.deepEqual(COMPOSITES.map(c => [c.weight, c.name, c.faces]), [
    ['regular', '신중고딕+sfpro-1', ['SM3SJGothic 03', 'SF Pro Display Regular']],
    ['bold', '볼드', ['SM3KGothic Regular', "Suisse Int'l Semi Bold"]],
  ]);
});

test('판형 keeps the 1920-wide sheet and changes only its height', () => {
  assert.deepEqual(Object.keys(FORMATS), ['16:9', '16:10', '4:3', 'iso']);
  assert.equal(sheetHeight(), 1080);
  assert.equal(sheetHeight('iso'), 1358, 'the portfolio page is 1920×1358 pt');
  assert.ok(isFormat('4:3'));
  for (const bad of ['3:2', 'toString', '__proto__', 169, undefined]) assert.equal(isFormat(bad), false, String(bad));
  // A taller sheet places the same photos lower and larger, always inside the sheet.
  const boxes = layoutPhotos([{ width: 1000, height: 1000 }], 1440);
  assert.equal(boxes[0].y + boxes[0].height, 1440 - 64);
  assert.deepEqual(layoutPhotos([{ width: 1600, height: 900 }]), layoutPhotos([{ width: 1600, height: 900 }], 1080));
});

test('Safari toolbar colors belong to web slides and are #rrggbb', () => {
  assert.ok(validDeck([{ ...web, tint: '#ffffff', tintDark: '#0e1012' }]));
  for (const bad of [{ ...web, tint: 'white' }, { ...web, tint: '#FFFFFF' }, { ...web, tintDark: '#fff' }, { ...text, tint: '#ffffff' }, { ...web, tint: 16777215 }])
    assert.equal(validDeck([bad]), false, JSON.stringify(bad).slice(0, 80));
});

test('tab stops and hanging indent validate; tabs stay in the text runs', () => {
  assert.ok(validDeck([{ ...text, text: '전시\t제16회 광주비엔날레', typo: { ...defaultTypography, tabs: [240, 720], indent: 240 } }]));
  for (const typo of [{ tabs: [720, 240] }, { tabs: [240, 240] }, { tabs: [0] }, { tabs: [1801] }, { tabs: Array.from({ length: 25 }, (_, i) => i + 1) }, { tabs: '240' }, { indent: -1 }, { indent: 1801 }])
    assert.equal(validDeck([{ ...text, typo: { ...defaultTypography, ...typo } }]), false, JSON.stringify(typo));
  assert.equal(runs('전시\t제16회\t\tA').map(r => r.text).join(''), '전시\t제16회\t\tA');
  assert.deepEqual(paragraphs('\t\t오브제는\n\n전시\t광주'), ['\t\t오브제는', '전시\t광주'], 'leading tabs are kept');
});

test('a picture slide switches between 넘김 (sequence) and 격자 (one-sheet grid) and keeps its timing', () => {
  const grid = { ...sequence, kind: 'gallery' };
  assert.ok(validDeck([grid]), 'sequence timing left on a grid slide is harmless');
  assert.ok(validDeck([{ ...grid, kind: 'sequence' }]));
  const many = Array.from({ length: 61 }, (_, i) => photo('p' + i));
  assert.ok(validDeck([{ ...sequence, photos: many }]), 'a sequence takes more than 60');
  assert.equal(validDeck([{ ...grid, photos: many }]), false, 'a grid takes at most 60');
});

test('격자 layouts: one height (rows) or one width (columns), equal gaps, inside the margin; cover fills', () => {
  const photos = [{ width: 1600, height: 900 }, { width: 900, height: 1600 }, { width: 1000, height: 1000 }, { width: 1200, height: 800 }, { width: 800, height: 1200 }];
  const close = (a, b, d = 0.01) => Math.abs(a - b) < d;
  const inside = (b, m, H) => b.x >= m - 0.01 && b.y >= m - 0.01 && b.x + b.width <= 1920 - m + 0.01 && b.y + b.height <= H - m + 0.01;
  const lines = (boxes, key) => Object.values(Object.groupBy(boxes, b => Math.round(b[key])));
  for (const [H, m, gap] of [[1080, 96, 24], [1440, 64, 40], [1080, 160, 0]]) {
    const rows = layoutPhotos(photos, H, { layout: 'rows', gap }, m);
    assert.ok(rows.every(b => close(b.height, rows[0].height)), 'one height');
    assert.ok(rows.every((b, i) => close(b.width / b.height, photos[i].width / photos[i].height)), 'contain keeps each aspect');
    assert.ok(rows.every(b => inside(b, m, H)), 'inside the margin');
    for (const row of lines(rows, 'y')) for (let i = 1; i < row.length; i++) assert.ok(close(row[i].x - row[i - 1].x - row[i - 1].width, gap), 'equal gaps in a row');
    const ys = [...new Set(rows.map(b => Math.round(b.y)))];
    for (let i = 1; i < ys.length; i++) assert.ok(close(ys[i] - ys[i - 1] - rows[0].height, gap, 1), 'equal gaps between rows');
    assert.ok(rows.some(b => close(b.x, m, 0.5) || close(b.y, m, 0.5)), 'as large as the margin allows');
    const columns = layoutPhotos(photos, H, { layout: 'columns', gap }, m);
    assert.ok(columns.every(b => close(b.width, columns[0].width)), 'one width');
    assert.ok(columns.every((b, i) => close(b.width / b.height, photos[i].width / photos[i].height)));
    assert.ok(columns.every(b => inside(b, m, H)));
    for (const column of lines(columns, 'x')) { column.sort((a, b) => a.y - b.y); for (let i = 1; i < column.length; i++) assert.ok(close(column[i].y - column[i - 1].y - column[i - 1].height, gap), 'equal gaps in a column'); }
    for (const layout of ['rows', 'columns']) {
      const cover = layoutPhotos(photos, H, { layout, fit: 'cover', gap }, m);
      assert.ok(close(Math.min(...cover.map(b => b.x)), m) && close(Math.max(...cover.map(b => b.x + b.width)), 1920 - m), `${layout} cover fills the width`);
      assert.ok(close(Math.min(...cover.map(b => b.y)), m) && close(Math.max(...cover.map(b => b.y + b.height)), H - m), `${layout} cover fills the height`);
    }
    const cells = layoutPhotos(photos, H, { layout: 'cells', fit: 'cover', gap }, m);
    assert.ok(cells.every(b => close(b.width, cells[0].width) && close(b.height, cells[0].height) && inside(b, m, H)), 'cover cells are equal');
  }
  const [one] = layoutPhotos([photos[0]], 1080, { layout: 'rows' }, 64);
  assert.ok(close(one.height, 952) && close(one.width, 952 * 16 / 9) && close(one.x, 64 + (1792 - 952 * 16 / 9) / 2) && close(one.y, 64), 'one image: as large as the 1792×952 box allows, centred');
  assert.equal(layoutPhotos(photos, 1080, { layout: 'rows' }, 600).length, 0, 'no room');
});

test('slide margin, image arrangement and tab interval validate', () => {
  assert.ok(validDeck([{ ...sequence, margin: 120, layout: 'columns', fit: 'cover', gap: 0 }, { ...web, margin: 0 }]));
  assert.ok(validDeck([{ ...text, typo: { ...defaultTypography, tabSize: 240 } }]));
  for (const bad of [{ ...sequence, margin: -1 }, { ...sequence, margin: 481 }, { ...sequence, layout: 'masonry' }, { ...sequence, fit: 'fill' }, { ...sequence, gap: 401 },
    { ...web, layout: 'rows' }, { ...text, fit: 'cover' }, { ...text, typo: { ...defaultTypography, tabSize: 4 } }])
    assert.equal(validDeck([bad]), false, JSON.stringify(bad).slice(0, 90));
  assert.deepEqual({ ...defaultTypography }, { size: 64, leading: 100, paragraph: 100, tracking: -25, top: 96, left: 96, right: 96, composite: 'bold' }, 'new text default');
});
