import test from 'node:test';
import assert from 'node:assert/strict';
import { validDeck, assetIds, defaultTypography, assetTypes } from '../app/model.ts';
import { runs, paragraphs, styleOf, runStyles } from '../app/composite.ts';
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
  assert.deepEqual(style('디자인'), { font: 'hangul', scale: 0.99, shift: 0 });
  assert.deepEqual(style('Visual'), { font: 'latin', scale: 1, shift: 0.05 });
  assert.deepEqual(style('“제품”'), { font: 'hangul', scale: 0.99, shift: 0 });
  assert.deepEqual(style('×'), { font: 'latin', scale: 1, shift: 0 });
  assert.deepEqual(runStyles[styleOf('一'.codePointAt(0))], { font: 'hangul', scale: 1, shift: 0 }, 'unlisted characters use the base font');
  assert.equal(r.map(x => x.text).join(''), '디자인 Visual 2026년 “제품” ×');
  assert.deepEqual(paragraphs('첫 줄\n같은 문단\n\n\n둘째\n \n셋째\n'), ['첫 줄\n같은 문단', '둘째', '셋째']);
});

test('asset table has no inherited keys', () => {
  assert.equal(assetTypes.constructor, undefined);
  assert.equal(assetTypes['image/svg+xml'], 'svg');
});
