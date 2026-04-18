export const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const LEGACY_STORAGE_CACHE_KEY = 'translationCache';
export const CACHE_META_KEY = 'translationCacheMeta';
export const CACHE_BUCKET_PREFIX = 'translationCacheBucket:';
export const CACHE_BUCKET_COUNT = 64;
export const STORAGE_SCHEMA_VERSION = 2;

export function buildCacheKey(text, targetLang) {
  return `${targetLang}::${text}`;
}

export function isCacheEntryFresh(entry, now = Date.now()) {
  return Boolean(
    entry
      && typeof entry.translation === 'string'
      && typeof entry.updatedAt === 'number'
      && now - entry.updatedAt <= CACHE_TTL_MS,
  );
}

export function pruneExpiredEntries(entries = {}, now = Date.now()) {
  return Object.fromEntries(
    Object.entries(entries || {}).filter(([, entry]) => isCacheEntryFresh(entry, now)),
  );
}

export function mergeCacheEntries(existingEntries = {}, incomingEntries = {}, now = Date.now()) {
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

export function getBucketStorageKey(bucketIndex) {
  return `${CACHE_BUCKET_PREFIX}${String(bucketIndex).padStart(2, '0')}`;
}

export function getAllBucketStorageKeys(bucketCount = CACHE_BUCKET_COUNT) {
  return Array.from({ length: bucketCount }, (_, index) => getBucketStorageKey(index));
}

export function hashCacheKey(cacheKey = '') {
  let hash = 0;

  for (let index = 0; index < cacheKey.length; index += 1) {
    hash = (hash * 31 + cacheKey.charCodeAt(index)) >>> 0;
  }

  return hash;
}

export function getBucketIndexForCacheKey(cacheKey, bucketCount = CACHE_BUCKET_COUNT) {
  return hashCacheKey(cacheKey) % bucketCount;
}

export function getBucketStorageKeyForCacheKey(cacheKey, bucketCount = CACHE_BUCKET_COUNT) {
  return getBucketStorageKey(getBucketIndexForCacheKey(cacheKey, bucketCount));
}

export function normalizeBucketEntries(bucketEntries = {}, now = Date.now()) {
  return pruneExpiredEntries(bucketEntries, now);
}

export function distributeEntriesAcrossBuckets(entries = {}, now = Date.now(), bucketCount = CACHE_BUCKET_COUNT) {
  const buckets = {};

  for (const [cacheKey, entry] of Object.entries(pruneExpiredEntries(entries, now))) {
    const bucketKey = getBucketStorageKeyForCacheKey(cacheKey, bucketCount);
    const existingBucket = buckets[bucketKey] ?? {};
    buckets[bucketKey] = mergeCacheEntries(existingBucket, { [cacheKey]: entry }, now);
  }

  return buckets;
}

export function flattenBuckets(bucketRecord = {}, now = Date.now()) {
  let merged = {};

  for (const bucketEntries of Object.values(bucketRecord || {})) {
    merged = mergeCacheEntries(merged, normalizeBucketEntries(bucketEntries, now), now);
  }

  return merged;
}

export function getCacheMeta(bucketCount = CACHE_BUCKET_COUNT) {
  return {
    version: STORAGE_SCHEMA_VERSION,
    bucketCount,
  };
}
