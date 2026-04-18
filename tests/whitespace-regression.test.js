import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWhitespace } from '../src/common.js';

test('normalizeWhitespace preserves line breaks between paragraphs', () => {
  const input = 'line one\nline two\n\nline three';
  assert.equal(normalizeWhitespace(input), 'line one\nline two\n\nline three');
});
