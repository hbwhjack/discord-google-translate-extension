import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function loadText(relativePath) {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('content script deduplicates concurrent identical translation requests', async () => {
  const script = await loadText('src/content.js');

  assert.equal(
    script.includes('const pendingTranslations = new Map();'),
    true,
    'content script should track in-flight translations to avoid duplicate fetches for the same text',
  );

  assert.equal(
    script.includes('const pendingTranslation = pendingTranslations.get(cacheKey);'),
    true,
    'content script should reuse an in-flight translation promise before starting another fetch',
  );

  assert.equal(
    script.includes('pendingTranslations.set(cacheKey, translationPromise);'),
    true,
    'content script should register the in-flight promise before awaiting the network request',
  );

  assert.equal(
    script.includes('pendingTranslations.delete(cacheKey);'),
    true,
    'content script should clean up finished in-flight promises',
  );
});

test('content script cools down repeated failed translation requests for the same key', async () => {
  const script = await loadText('src/content.js');

  assert.equal(
    script.includes('const failedTranslations = new Map();'),
    true,
    'content script should track recent failed translations separately from successful cache entries',
  );

  assert.equal(
    script.includes('const FAILED_TRANSLATION_COOLDOWN_MS = 3000;'),
    true,
    'content script should define a short failure cooldown window',
  );

  assert.equal(
    script.includes('const failedAt = failedTranslations.get(cacheKey);'),
    true,
    'content script should check whether the same translation key failed recently',
  );

  assert.equal(
    script.includes('now - failedAt < FAILED_TRANSLATION_COOLDOWN_MS'),
    true,
    'content script should skip re-fetching if the last failure is still within cooldown',
  );

  assert.equal(
    script.includes('failedTranslations.set(cacheKey, now);'),
    true,
    'content script should record failed attempts for cooldown enforcement',
  );

  assert.equal(
    script.includes('failedTranslations.delete(cacheKey);'),
    true,
    'content script should clear failure cooldown after a successful translation',
  );
});
