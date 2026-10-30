import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE, cleanQuery, hitsOf, badgeText } from '../extension/format.js';

test('виділений текст із переносами стає одним рядком запиту', () => {
  assert.equal(cleanQuery('  SN 123\n 456 '), 'SN 123 456');
});

test('запит із довгого виділення обрізається до ста символів', () => {
  assert.equal(cleanQuery('а'.repeat(500)).length, 100);
});

test('посилання на позицію кодує назву листа й веде на її рядок', () => {
  const [hit] = hitsOf({ serial: [{ sheet: 'майно не облік', row: 7, name: 'Рація' }] });
  assert.equal(hit.url, `${SITE}/?sheet=${encodeURIComponent('майно не облік')}&row=7`);
});

test('серійники стоять раніше за збіги деінде', () => {
  const hits = hitsOf({
    other: [{ sheet: 'ПНВ', row: 2, name: 'Інше' }],
    serial: [{ sheet: 'ПНВ', row: 3, name: 'Серійник' }],
  });
  assert.deepEqual(hits.map((h) => h.title), ['Серійник', 'Інше']);
});

test('позиція без назви показує перше непорожнє значення рядка', () => {
  const [hit] = hitsOf({ other: [{ sheet: 'ПНВ', row: 2, values: ['', 'Т-1'] }] });
  assert.equal(hit.title, 'Т-1');
});

test('порожня відповідь пошуку дає порожній список', () => {
  assert.deepEqual(hitsOf({}), []);
});

test('без термінових посилок значок порожній, а не нуль', () => {
  assert.equal(badgeText({ delivery: { urgent: [] } }), '');
});

test('значок рахує термінові посилки', () => {
  assert.equal(badgeText({ delivery: { urgent: [{}, {}] } }), '2');
});

test('адреса сайту збігається з дозволом у маніфесті', () => {
  const m = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.deepEqual(m.host_permissions, [`${SITE}/*`]);
});
