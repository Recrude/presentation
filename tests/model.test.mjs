import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initial,
  reorder,
  numberOf,
  layoutPhotos,
  embed,
  youtubeUrl,
  validDeck,
} from '../app/model.ts';

test('moving to the end, back to the beginning and adjacent drop slots preserve all slides', () => {
  const last = reorder(initial, initial[0].id, initial.length);
  assert.equal(last.at(-1).id, initial[0].id);
  assert.deepEqual(reorder(last, initial[0].id, 0), initial);
  assert.strictEqual(reorder(initial, initial[5].id, 6), initial);
  assert.strictEqual(reorder(initial, 'missing', 10), initial);
  assert.strictEqual(reorder(initial, initial[0].id, -1), initial);
  assert.equal(new Set(last.map((s) => s.id)).size, 79);
});

test('page numbers follow reordered visible slides, including added gallery and video', () => {
  const deck = [
    initial[3],
    { ...initial[0], hidden: true },
    { ...initial[1], id: 'gallery', kind: 'gallery' },
    initial[2],
  ];
  assert.equal(numberOf(deck, initial[3].id), 1);
  assert.equal(numberOf(deck, initial[0].id), null);
  assert.equal(numberOf(deck, 'gallery'), 2);
  assert.equal(numberOf(deck, initial[2].id), 3);
  assert.equal(numberOf([], 'anything'), null);
});

test('gallery layout retains every aspect ratio with padding and no overlap for 1–60 images', () => {
  for (let count = 1; count <= 60; count++) {
    for (const ratios of [
      [16 / 9],
      [2 / 3],
      [1],
      [16 / 9, 2 / 3, 1, 4, 0.25],
    ]) {
      const photos = Array.from({ length: count }, (_, i) => ({
        width: ratios[i % ratios.length] * 1200,
        height: 1200,
      }));
      const boxes = layoutPhotos(photos);
      assert.equal(boxes.length, count);
      boxes.forEach((b, i) => {
        assert.ok(b.x >= 64 - 1e-6 && b.y >= 64 - 1e-6);
        assert.ok(
          b.x + b.width <= 1856 + 1e-6 && b.y + b.height <= 1016 + 1e-6,
        );
        assert.ok(b.width > 0 && b.height > 0);
        assert.ok(
          Math.abs(b.width / b.height - photos[i].width / photos[i].height) <
            1e-6,
        );
        boxes
          .slice(i + 1)
          .forEach((c) =>
            assert.ok(
              b.x + b.width <= c.x + 1e-6 ||
                c.x + c.width <= b.x + 1e-6 ||
                b.y + b.height <= c.y + 1e-6 ||
                c.y + c.height <= b.y + 1e-6,
            ),
          );
      });
    }
  }
});

test('youtube inputs normalize, autoplay is presentation-only and controls remain visible for saved decks', () => {
  for (const src of [
    'https://youtu.be/QIAcSGkOLDk',
    'https://www.youtube.com/watch?v=QIAcSGkOLDk',
    '<iframe src="https://www.youtube-nocookie.com/embed/QIAcSGkOLDk?si=abc"></iframe>',
  ]) {
    const e = embed(src);
    assert.equal(e.src, 'https://www.youtube-nocookie.com/embed/QIAcSGkOLDk');
    const s = { ...initial[0], ...e };
    const playing = new URL(youtubeUrl(s, true));
    assert.equal(playing.searchParams.get('autoplay'), '1');
    assert.equal(playing.searchParams.get('mute'), '1');
    assert.equal(playing.searchParams.get('controls'), '1');
    assert.equal(
      new URL(youtubeUrl(s, false)).searchParams.get('autoplay'),
      '0',
    );
    assert.equal(
      new URL(
        youtubeUrl({ ...s, controls: false, muted: false }, true),
      ).searchParams.get('controls'),
      '1',
    );
  }
  assert.throws(() => embed('javascript:alert(1)'));
  assert.throws(() => embed('https://youtube.com/watch?v=bad'));
  assert.throws(() => embed('https://user:password@example.com'));
});

test('previous decks including empty decks restore; malformed or duplicate slides fail', () => {
  assert.equal(validDeck(initial), true);
  assert.equal(validDeck([]), true);
  assert.equal(validDeck([initial[0], initial[0]]), false);
  assert.equal(
    validDeck([{ ...initial[0], src: '/slides/page-99.webp' }]),
    false,
  );
  assert.equal(
    validDeck([
      {
        ...initial[0],
        kind: 'gallery',
        photos: [{ id: 'x', name: 'x', width: 0, height: 1 }],
      },
    ]),
    false,
  );
  assert.equal(
    validDeck([
      {
        ...initial[0],
        kind: 'gallery',
        photos: [{ id: 'x', name: 'x', width: 800, height: 1200 }],
      },
    ]),
    true,
  );
});

test('chronological default includes all 79 original pages exactly once', async () => {
  const { chronologicalPages, projects, sortOriginalSlides } = await import('../app/chronology.ts');
  assert.deepEqual([...chronologicalPages].sort((a,b)=>a-b),Array.from({length:79},(_,i)=>i));
  assert.deepEqual(chronologicalPages.slice(0,4),[0,1,74,75]);
  assert.equal(chronologicalPages.at(-1),78);
  assert.deepEqual(projects.map(p=>p.start),projects.map(p=>p.start).sort());
  for(const p of projects) {
    const pos=chronologicalPages.indexOf(p.first);
    assert.deepEqual(chronologicalPages.slice(pos,pos+p.last-p.first+1),Array.from({length:p.last-p.first+1},(_,i)=>p.first+i));
  }
  const custom={id:'custom',kind:'web',src:'https://ved.kr/',title:'x',hidden:false};
  const mixed=[initial.at(-2),custom,initial[2]];
  const sorted=sortOriginalSlides(mixed);assert.equal(sorted[1],custom);assert.equal(sorted[0],initial[2]);
});

test('uploaded folios require exactly one valid image and a readable palette', async()=>{
  const { contrastingInk } = await import('../app/folio-palette.ts');
  const s={id:'folio',title:'New',kind:'folio',src:'',hidden:false,photos:[{id:'asset',name:'x.jpg',width:3840,height:2716}],folioPalette:{background:'#ffffff',foreground:'#000000'}};
  assert.equal(validDeck([s]),true);
  assert.equal(validDeck([{...s,photos:[]}]),false);
  assert.equal(validDeck([{...s,photos:[...s.photos,...s.photos]}]),false);
  assert.equal(validDeck([{...s,folioPalette:{background:'url(x)',foreground:'red'}}]),false);
  assert.equal(contrastingInk(255,255,255),'#000000');assert.equal(contrastingInk(0,0,0),'#ffffff');
});
