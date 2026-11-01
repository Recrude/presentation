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
