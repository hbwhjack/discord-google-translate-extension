export const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const STORAGE_CACHE_KEY = 'translationCache';

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
    Object.entries(entries).filter(([, entry]) => isCacheEntryFresh(entry, now)),
  );
}
