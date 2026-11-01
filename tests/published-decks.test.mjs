import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validDeck, assetIds, isFormat } from '../app/model.ts';
import { validCatalog, deckEntry, route } from '../app/catalog.ts';
const root = new URL('../public/', import.meta.url).pathname;
const catalog = JSON.parse(fs.readFileSync(root + 'decks/catalog.json', 'utf8'));

test('every published deck in the repository reads in the viewer and has its files', () => {
  assert.ok(validCatalog(catalog));
  for (const item of catalog.items) {
    const entry = deckEntry(item);
    if (!entry) continue;
    assert.equal(route(`/presentations/${entry.shortSlug}/`, catalog).entry?.slug, item.id, `${item.id} route`);
    const file = root + `decks/${item.id}/deck.json`;
    if (!fs.existsSync(file)) continue;
    const deck = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(deck.version, 1); assert.equal(deck.slug, item.id);
    assert.ok(deck.format === undefined || isFormat(deck.format));
    assert.ok(validDeck(deck.slides), `${item.id} slides`);
    for (const id of assetIds(deck.slides)) {
      const url = deck.assets[id];
      assert.match(url, /^\/presentations\/decks\/[a-z0-9-]+\/assets\/[a-f0-9]{64}\.(png|jpg|webp|gif|avif|svg|mp4|webm)$/, `${item.id} ${id}`);
      assert.ok(fs.existsSync(root + url.slice('/presentations/'.length)), `${item.id} file ${url}`);
    }
  }
});

test('the Code Club talk is listed publicly after the 9/9 talk', () => {
  const ids = catalog.items.map(i => i.id), codeclub = catalog.items.find(i => i.presentation?.slug === '260115-codeclub');
  assert.deepEqual(codeclub?.presentation, { title: 'Bar-Code: Connecting Reality and Digital Media', date: '2026-01-15', slug: '260115-codeclub', venue: 'Code Club' });
  assert.equal(codeclub.public, true);
  assert.equal(ids.indexOf(codeclub.id), ids.indexOf('2026-09-09-ahn-byunghak-graduation-project') + 1);
});

test('talks show where they were given; the venue is optional, trimmed and short', async () => {
  const { validDetails, catalogEntries } = await import('../app/catalog.ts');
  assert.ok(catalogEntries.every(e => e.venue === 'HIVCD'), 'school talks');
  assert.ok(catalogEntries.every(e => e.date), 'every older talk has a date');
  const base = { title: 'T', date: '2026-01-15', slug: 't' };
  assert.ok(validDetails(base) && validDetails({ ...base, venue: 'Code Club' }));
  for (const venue of ['', ' Code Club', 'x'.repeat(81), 3]) assert.equal(validDetails({ ...base, venue }), false, JSON.stringify(venue));
});
