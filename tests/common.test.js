import test from 'node:test';
import assert from 'node:assert/strict';

import {
  shouldTranslateText,
  splitForGoogleTranslate,
  normalizeGoogleTranslateResponse,
} from '../src/common.js';

test('shouldTranslateText rejects short or blank text', () => {
  assert.equal(shouldTranslateText(''), false);
  assert.equal(shouldTranslateText('   '), false);
  assert.equal(shouldTranslateText('ok'), false);
  assert.equal(shouldTranslateText('hello world'), true);
});

test('splitForGoogleTranslate keeps chunks under the limit', () => {
  const input = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda';
  const parts = splitForGoogleTranslate(input, 20);

  assert.ok(parts.length > 1);
  assert.deepEqual(parts.join(' '), input);
  assert.ok(parts.every((part) => part.length <= 20));
});

test('normalizeGoogleTranslateResponse flattens google array payload', () => {
  const payload = [
    [
      ['你好', 'hello', null, null],
      ['世界', 'world', null, null],
    ],
  ];

  assert.equal(normalizeGoogleTranslateResponse(payload), '你好世界');
});
