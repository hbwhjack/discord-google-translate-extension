import {
  buildGoogleTranslateUrl,
  DEFAULT_TARGET_LANG,
  normalizeGoogleTranslateResponse,
  shouldTranslateText,
  splitForGoogleTranslate,
} from './common.js';
import {
  buildCacheKey,
  CACHE_TTL_MS,
  isCacheEntryFresh,
  pruneExpiredEntries,
  STORAGE_CACHE_KEY,
} from './cache.js';

const LOG_PREFIX = '[JB Discord Translate]';
const cache = new Map();
let cacheLoaded = false;

function getStorageArea() {
  return chrome?.storage?.local ?? null;
}

async function loadPersistentCache() {
  if (cacheLoaded) {
    return;
  }

  cacheLoaded = true;
  const storage = getStorageArea();
  if (!storage) {
    return;
  }

  const stored = await storage.get(STORAGE_CACHE_KEY);
  const prunedEntries = pruneExpiredEntries(stored?.[STORAGE_CACHE_KEY]);

  cache.clear();
  for (const [key, entry] of Object.entries(prunedEntries)) {
    cache.set(key, entry);
  }

  await storage.set({ [STORAGE_CACHE_KEY]: prunedEntries });
}

async function persistCache() {
  const storage = getStorageArea();
  if (!storage) {
    return;
  }

  const entries = Object.fromEntries(cache.entries());
  const prunedEntries = pruneExpiredEntries(entries);

  cache.clear();
  for (const [key, entry] of Object.entries(prunedEntries)) {
    cache.set(key, entry);
  }

  await storage.set({ [STORAGE_CACHE_KEY]: prunedEntries });
}

async function translateSegment(text, targetLang) {
  await loadPersistentCache();

  const cacheKey = buildCacheKey(text, targetLang);
  const cachedEntry = cache.get(cacheKey);
  if (isCacheEntryFresh(cachedEntry)) {
    return cachedEntry.translation;
  }

  if (cachedEntry) {
    cache.delete(cacheKey);
  }

  const response = await fetch(buildGoogleTranslateUrl(text, targetLang), {
    method: 'GET',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`Google Translate request failed: ${response.status}`);
  }

  const payload = await response.json();
  const translated = normalizeGoogleTranslateResponse(payload);
  cache.set(cacheKey, {
    translation: translated,
    updatedAt: Date.now(),
  });
  await persistCache();
  return translated;
}

async function translateText(text, targetLang = DEFAULT_TARGET_LANG) {
  if (!shouldTranslateText(text)) {
    return '';
  }

  const parts = splitForGoogleTranslate(text);
  const translatedParts = [];

  for (const part of parts) {
    const translated = await translateSegment(part, targetLang);
    translatedParts.push(translated);
  }

  return translatedParts.join(' ').trim();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'JB_TRANSLATE_TEXT') {
    return false;
  }

  console.info(`${LOG_PREFIX} received translation request`, {
    length: message.text?.length ?? 0,
    targetLang: message.targetLang,
  });

  translateText(message.text, message.targetLang)
    .then((translation) => {
      console.info(`${LOG_PREFIX} translated message`, {
        inputLength: message.text?.length ?? 0,
        outputLength: translation.length,
      });
      sendResponse({ ok: true, translation });
    })
    .catch((error) => {
      console.error(`${LOG_PREFIX} translation failed`, error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

console.info(`${LOG_PREFIX} background service worker active`);
