import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CACHE_TTL_MS,
  buildCacheKey,
  isCacheEntryFresh,
  pruneExpiredEntries,
} from '../src/cache.js';

test('cache TTL defaults to roughly 3 months', () => {
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  assert.equal(CACHE_TTL_MS, ninetyDaysMs);
});

test('buildCacheKey includes target language and text', () => {
  assert.equal(buildCacheKey('hello', 'zh-CN'), 'zh-CN::hello');
});

test('isCacheEntryFresh accepts unexpired entry and rejects expired entry', () => {
  const now = Date.UTC(2026, 0, 31);
  const fresh = { translation: '你好', updatedAt: now - CACHE_TTL_MS + 1000 };
  const expired = { translation: '你好', updatedAt: now - CACHE_TTL_MS - 1 };

  assert.equal(isCacheEntryFresh(fresh, now), true);
  assert.equal(isCacheEntryFresh(expired, now), false);
  assert.equal(isCacheEntryFresh(null, now), false);
});

test('pruneExpiredEntries removes expired cache items only', () => {
  const now = Date.UTC(2026, 0, 31);
  const entries = {
    'zh-CN::fresh': { translation: '新的', updatedAt: now - 1000 },
    'zh-CN::expired': { translation: '旧的', updatedAt: now - CACHE_TTL_MS - 1 },
  };

  assert.deepEqual(pruneExpiredEntries(entries, now), {
    'zh-CN::fresh': { translation: '新的', updatedAt: now - 1000 },
  });
});
