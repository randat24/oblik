import test from 'node:test';
import assert from 'node:assert/strict';
import { isImageMime } from '../lib/mime.js';

test('фото: зображення проходять', () => {
  for (const m of ['image/jpeg', 'image/PNG', 'image/heic', ' image/webp ']) assert.equal(isImageMime(m), true, m);
});

test('фото: html, svg, pdf і порожнє не віддаються', () => {
  for (const m of ['text/html', 'image/svg+xml', 'application/pdf', '', undefined, null]) {
    assert.equal(isImageMime(m), false, String(m));
  }
});
