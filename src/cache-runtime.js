(() => {
  const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
  const LEGACY_STORAGE_CACHE_KEY = 'translationCache';
  const CACHE_META_KEY = 'translationCacheMeta';
  const CACHE_BUCKET_PREFIX = 'translationCacheBucket:';
  const CACHE_BUCKET_COUNT = 64;
  const STORAGE_SCHEMA_VERSION = 2;

  function buildCacheKey(text, targetLang) {
    return `${targetLang}::${text}`;
  }

  function isCacheEntryFresh(entry, now = Date.now()) {
    return Boolean(
      entry
        && typeof entry.translation === 'string'
        && typeof entry.updatedAt === 'number'
        && now - entry.updatedAt <= CACHE_TTL_MS,
    );
  }

  function pruneExpiredEntries(entries = {}, now = Date.now()) {
    return Object.fromEntries(
      Object.entries(entries || {}).filter(([, entry]) => isCacheEntryFresh(entry, now)),
    );
  }

  function mergeCacheEntries(existingEntries = {}, incomingEntries = {}, now = Date.now()) {
    const merged = {
      ...pruneExpiredEntries(existingEntries, now),
    };

    for (const [key, entry] of Object.entries(pruneExpiredEntries(incomingEntries, now))) {
      const existing = merged[key];
      if (!existing || entry.updatedAt >= existing.updatedAt) {
        merged[key] = entry;
      }
    }

    return merged;
  }

  function getBucketStorageKey(bucketIndex) {
    return `${CACHE_BUCKET_PREFIX}${String(bucketIndex).padStart(2, '0')}`;
  }

  function getAllBucketStorageKeys(bucketCount = CACHE_BUCKET_COUNT) {
    return Array.from({ length: bucketCount }, (_, index) => getBucketStorageKey(index));
  }

  function hashCacheKey(cacheKey = '') {
    let hash = 0;

    for (let index = 0; index < cacheKey.length; index += 1) {
      hash = (hash * 31 + cacheKey.charCodeAt(index)) >>> 0;
    }

    return hash;
  }

  function getBucketIndexForCacheKey(cacheKey, bucketCount = CACHE_BUCKET_COUNT) {
    return hashCacheKey(cacheKey) % bucketCount;
  }

  function getBucketStorageKeyForCacheKey(cacheKey, bucketCount = CACHE_BUCKET_COUNT) {
    return getBucketStorageKey(getBucketIndexForCacheKey(cacheKey, bucketCount));
  }

  function normalizeBucketEntries(bucketEntries = {}, now = Date.now()) {
    return pruneExpiredEntries(bucketEntries, now);
  }

  function distributeEntriesAcrossBuckets(entries = {}, now = Date.now(), bucketCount = CACHE_BUCKET_COUNT) {
    const buckets = {};

    for (const [cacheKey, entry] of Object.entries(pruneExpiredEntries(entries, now))) {
      const bucketKey = getBucketStorageKeyForCacheKey(cacheKey, bucketCount);
      const existingBucket = buckets[bucketKey] ?? {};
      buckets[bucketKey] = mergeCacheEntries(existingBucket, { [cacheKey]: entry }, now);
    }

    return buckets;
  }

  function flattenBuckets(bucketRecord = {}, now = Date.now()) {
    let merged = {};

    for (const bucketEntries of Object.values(bucketRecord || {})) {
      merged = mergeCacheEntries(merged, normalizeBucketEntries(bucketEntries, now), now);
    }

    return merged;
  }

  function getCacheMeta(bucketCount = CACHE_BUCKET_COUNT) {
    return {
      version: STORAGE_SCHEMA_VERSION,
      bucketCount,
    };
  }

  async function ensureShardedCacheStorage(storage, now = Date.now()) {
    if (!storage) {
      return { migrated: false };
    }

    const bucketKeys = getAllBucketStorageKeys();
    const stored = await storage.get([CACHE_META_KEY, LEGACY_STORAGE_CACHE_KEY, ...bucketKeys]);
    const legacyEntries = pruneExpiredEntries(stored?.[LEGACY_STORAGE_CACHE_KEY], now);
    const existingBucketRecord = Object.fromEntries(
      bucketKeys
        .map((bucketKey) => [bucketKey, normalizeBucketEntries(stored?.[bucketKey], now)])
        .filter(([, bucketEntries]) => Object.keys(bucketEntries).length > 0),
    );
    const mergedBuckets = {
      ...existingBucketRecord,
      ...distributeEntriesAcrossBuckets(legacyEntries, now),
    };

    const writes = {
      [CACHE_META_KEY]: getCacheMeta(),
    };

    for (const bucketKey of bucketKeys) {
      writes[bucketKey] = mergedBuckets[bucketKey] ?? {};
    }

    await storage.set(writes);

    if (stored?.[LEGACY_STORAGE_CACHE_KEY]) {
      await storage.remove(LEGACY_STORAGE_CACHE_KEY);
    }

    return {
      migrated: Object.keys(legacyEntries).length > 0,
      bucketRecord: mergedBuckets,
    };
  }

  async function loadShardedCacheFromStorage(storage, now = Date.now()) {
    if (!storage) {
      return {};
    }

    const { bucketRecord } = await ensureShardedCacheStorage(storage, now);
    return flattenBuckets(bucketRecord, now);
  }

  async function upsertCacheEntryInStorage(storage, cacheKey, entry, now = Date.now()) {
    if (!storage || !isCacheEntryFresh(entry, now)) {
      return;
    }

    await ensureShardedCacheStorage(storage, now);
    const bucketStorageKey = getBucketStorageKeyForCacheKey(cacheKey);
    const stored = await storage.get(bucketStorageKey);
    const mergedBucket = mergeCacheEntries(stored?.[bucketStorageKey], { [cacheKey]: entry }, now);
    await storage.set({
      [CACHE_META_KEY]: getCacheMeta(),
      [bucketStorageKey]: mergedBucket,
    });
  }

  async function clearShardedCacheInStorage(storage) {
    if (!storage) {
      return;
    }

    await storage.remove([LEGACY_STORAGE_CACHE_KEY, CACHE_META_KEY, ...getAllBucketStorageKeys()]);
  }

  async function exportCacheFromStorage(storage, now = Date.now()) {
    if (!storage) {
      return {};
    }

    return loadShardedCacheFromStorage(storage, now);
  }

  async function importCacheToStorage(storage, entries = {}, now = Date.now()) {
    if (!storage) {
      return {};
    }

    const bucketKeys = getAllBucketStorageKeys();
    const buckets = distributeEntriesAcrossBuckets(entries, now);
    const writes = {
      [CACHE_META_KEY]: getCacheMeta(),
    };

    for (const bucketKey of bucketKeys) {
      writes[bucketKey] = buckets[bucketKey] ?? {};
    }

    await storage.set(writes);
    await storage.remove(LEGACY_STORAGE_CACHE_KEY);
    return flattenBuckets(buckets, now);
  }

  globalThis.JBDiscordTranslateCache = {
    CACHE_TTL_MS,
    CACHE_BUCKET_COUNT,
    CACHE_META_KEY,
    CACHE_BUCKET_PREFIX,
    LEGACY_STORAGE_CACHE_KEY,
    STORAGE_SCHEMA_VERSION,
    buildCacheKey,
    isCacheEntryFresh,
    pruneExpiredEntries,
    mergeCacheEntries,
    getBucketStorageKey,
    getAllBucketStorageKeys,
    getBucketStorageKeyForCacheKey,
    distributeEntriesAcrossBuckets,
    flattenBuckets,
    getCacheMeta,
    ensureShardedCacheStorage,
    loadShardedCacheFromStorage,
    upsertCacheEntryInStorage,
    clearShardedCacheInStorage,
    exportCacheFromStorage,
    importCacheToStorage,
  };
})();
