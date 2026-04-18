const DEFAULT_TARGET_LANG = 'zh-CN';
const LOG_PREFIX = '[JB Discord Translate]';

function normalizeWhitespace(text = '') {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function shouldTranslateText(text = '') {
  const normalized = normalizeWhitespace(text);
  if (normalized.length < 3) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(normalized);
}

const MESSAGE_SELECTOR = '[id^="message-content-"]';
const TRANSLATION_CLASS = 'jb-discord-translation';
const HANDLED_ATTR = 'data-jb-translation-bound';
const ORIGINAL_ATTR = 'data-jb-translation-source';
const SETTINGS_KEY = 'settings';
const cacheApi = globalThis.JBDiscordTranslateCache;
const LEGACY_STORAGE_CACHE_KEY = cacheApi.LEGACY_STORAGE_CACHE_KEY;
const DEFAULT_SETTINGS = {
  targetLanguage: DEFAULT_TARGET_LANG,
  translateDirectMessages: false,
  serverFilterMode: 'off',
  serverFilterList: '',
  channelFilterMode: 'off',
  channelFilterList: '',
};
const BLOCK_TAGS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const translationCache = new Map();
let cacheLoaded = false;
let processTimer = null;

function isGuildChannelRoute(pathname = window.location.pathname, translateDirectMessages = false) {
  if (!pathname.startsWith('/channels/')) {
    return false;
  }

  if (!translateDirectMessages && pathname.startsWith('/channels/@me/')) {
    return false;
  }

  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 3;
}

function normalizeFilterMode(value, fallback = 'off') {
  return ['off', 'whitelist', 'blacklist'].includes(value) ? value : fallback;
}

function normalizeIdList(value = '') {
  return String(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeSettings(raw = {}) {
  return {
    targetLanguage: typeof raw.targetLanguage === 'string' && raw.targetLanguage.trim()
      ? raw.targetLanguage.trim()
      : DEFAULT_SETTINGS.targetLanguage,
    translateDirectMessages: Boolean(raw.translateDirectMessages),
    serverFilterMode: normalizeFilterMode(raw.serverFilterMode, DEFAULT_SETTINGS.serverFilterMode),
    serverFilterList: normalizeIdList(raw.serverFilterList),
    channelFilterMode: normalizeFilterMode(raw.channelFilterMode, DEFAULT_SETTINGS.channelFilterMode),
    channelFilterList: normalizeIdList(raw.channelFilterList),
  };
}

function parseIdList(value = '') {
  return new Set(
    String(value)
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function matchesFilterMode(id, mode, listValue) {
  if (!id || mode === 'off') {
    return true;
  }

  const idSet = parseIdList(listValue);
  if (idSet.size === 0) {
    return mode !== 'whitelist';
  }

  const included = idSet.has(id);
  return mode === 'whitelist' ? included : !included;
}

function getRouteContext(pathname = window.location.pathname) {
  const parts = pathname.split('/').filter(Boolean);
  return {
    guildId: parts[1] || null,
    channelId: parts[2] || null,
  };
}

function shouldTranslateCurrentRoute(settings, pathname = window.location.pathname) {
  if (!isGuildChannelRoute(pathname, settings.translateDirectMessages)) {
    return false;
  }

  const { guildId, channelId } = getRouteContext(pathname);
  const isDirectMessage = guildId === '@me';

  if (!isDirectMessage && !matchesFilterMode(guildId, settings.serverFilterMode, settings.serverFilterList)) {
    return false;
  }

  if (!matchesFilterMode(channelId, settings.channelFilterMode, settings.channelFilterList)) {
    return false;
  }

  return true;
}

function injectStyles() {
  if (document.getElementById('jb-discord-translation-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'jb-discord-translation-style';
  style.textContent = `
    .${TRANSLATION_CLASS} {
      color: #f5d547;
      margin-top: 4px;
      white-space: pre-wrap;
      line-height: 1.5;
      font-size: 0.95em;
      word-break: break-word;
      text-shadow: 0 0 0.5px rgba(0, 0, 0, 0.2);
    }
  `;
  document.documentElement.append(style);
}

function buildCacheKey(text, targetLang = DEFAULT_TARGET_LANG) {
  return cacheApi.buildCacheKey(text, targetLang);
}

function isCacheEntryFresh(entry, now = Date.now()) {
  return cacheApi.isCacheEntryFresh(entry, now);
}

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

  const entries = await cacheApi.loadShardedCacheFromStorage(storage);
  translationCache.clear();
  for (const [key, entry] of Object.entries(entries)) {
    translationCache.set(key, entry);
  }
}

async function loadSettings() {
  const storage = getStorageArea();
  if (!storage) {
    return { ...DEFAULT_SETTINGS };
  }

  const stored = await storage.get(SETTINGS_KEY);
  const settings = normalizeSettings(stored?.[SETTINGS_KEY]);
  await storage.set({ [SETTINGS_KEY]: settings });
  return settings;
}

async function persistCacheEntry(cacheKey, entry) {
  const storage = getStorageArea();
  if (!storage) {
    return;
  }

  await cacheApi.upsertCacheEntryInStorage(storage, cacheKey, entry);
}

function splitForGoogleTranslate(text, maxLength = 1800) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxLength) {
    return [normalized];
  }

  const words = normalized.split(' ');
  const chunks = [];
  let current = '';

  for (const word of words) {
    if (word.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }

      for (let index = 0; index < word.length; index += maxLength) {
        chunks.push(word.slice(index, index + maxLength));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength) {
      chunks.push(current);
      current = word;
      continue;
    }

    current = next;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function normalizeGoogleTranslateResponse(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    return '';
  }

  return payload[0]
    .map((segment) => (Array.isArray(segment) ? segment[0] ?? '' : ''))
    .join('')
    .trim();
}

function buildGoogleTranslateUrl(text, targetLang = DEFAULT_TARGET_LANG) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', targetLang);
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);
  return url.toString();
}

function splitNormalizedBlocks(text = '') {
  return normalizeWhitespace(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function getMessageText(element) {
  const cloned = element.cloneNode(true);
  cloned.querySelectorAll(`.${TRANSLATION_CLASS}`).forEach((node) => node.remove());
  return normalizeWhitespace(cloned.innerText || cloned.textContent || '');
}

function getMessageBlocks(element) {
  const cloned = element.cloneNode(true);
  cloned.querySelectorAll(`.${TRANSLATION_CLASS}`).forEach((node) => node.remove());

  const blockChildren = Array.from(cloned.children).filter((child) => BLOCK_TAGS.has(child.tagName));
  if (blockChildren.length > 0) {
    const blocks = blockChildren.flatMap((child) => splitNormalizedBlocks(child.innerText || child.textContent || ''));
    if (blocks.length > 0) {
      return blocks;
    }
  }

  return splitNormalizedBlocks(cloned.innerText || cloned.textContent || '');
}

function cleanupDuplicateTranslations(element) {
  const nodes = Array.from(element.querySelectorAll(`:scope > .${TRANSLATION_CLASS}`));
  let legacySibling = element.nextElementSibling;
  while (legacySibling?.classList?.contains(TRANSLATION_CLASS)) {
    const next = legacySibling.nextElementSibling;
    legacySibling.remove();
    legacySibling = next;
  }

  if (nodes.length <= 1) {
    return nodes[0] || null;
  }

  const [first, ...rest] = nodes;
  rest.forEach((node) => node.remove());
  return first;
}

function findTranslationNode(element) {
  return cleanupDuplicateTranslations(element);
}

function shouldSkipElement(element) {
  if (!element?.isConnected) {
    return true;
  }

  if (element.closest('[role="textbox"], form, [aria-label*="Send a message"], [aria-label*="发送消息"]')) {
    return true;
  }

  if (element.classList.contains(TRANSLATION_CLASS) || element.closest(`.${TRANSLATION_CLASS}`)) {
    return true;
  }

  return false;
}

async function requestTranslation(text, targetLanguage) {
  await loadPersistentCache();

  const cacheKey = buildCacheKey(text, targetLanguage);
  const cachedEntry = translationCache.get(cacheKey);
  if (isCacheEntryFresh(cachedEntry)) {
    return cachedEntry.translation;
  }

  if (cachedEntry) {
    translationCache.delete(cacheKey);
  }

  const parts = splitForGoogleTranslate(text);
  const translatedParts = [];

  for (const part of parts) {
    const response = await fetch(buildGoogleTranslateUrl(part, targetLanguage), {
      method: 'GET',
      credentials: 'omit',
    });

    if (!response.ok) {
      console.info(`${LOG_PREFIX} translation request failed`, response.status);
      return '';
    }

    const payload = await response.json();
    translatedParts.push(normalizeGoogleTranslateResponse(payload));
  }

  const translation = normalizeWhitespace(translatedParts.join(' '));
  if (!translation) {
    return '';
  }

  const entry = {
    translation,
    updatedAt: Date.now(),
  };
  translationCache.set(cacheKey, entry);
  await persistCacheEntry(cacheKey, entry);
  return translation;
}

async function requestTranslations(textBlocks, targetLanguage) {
  const translations = [];

  for (const block of textBlocks) {
    if (!shouldTranslateText(block)) {
      continue;
    }

    const translated = await requestTranslation(block, targetLanguage);
    if (!translated || translated === block) {
      continue;
    }

    translations.push(translated);
  }

  return translations;
}

function renderTranslationNode(node, lines) {
  node.replaceChildren();

  lines.forEach((line) => {
    const lineNode = document.createElement('div');
    lineNode.textContent = line;
    node.appendChild(lineNode);
  });
}

async function processElement(element, settings) {
  if (shouldSkipElement(element)) {
    return;
  }

  const sourceText = getMessageText(element);
  const sourceBlocks = getMessageBlocks(element);
  const existingTranslationNode = findTranslationNode(element);

  if (!shouldTranslateText(sourceText)) {
    if (existingTranslationNode) {
      existingTranslationNode.remove();
    }
    element.removeAttribute(HANDLED_ATTR);
    element.removeAttribute(ORIGINAL_ATTR);
    return;
  }

  if (element.getAttribute(HANDLED_ATTR) === '1' && element.getAttribute(ORIGINAL_ATTR) === sourceText) {
    return;
  }

  const translations = await requestTranslations(
    sourceBlocks.length > 0 ? sourceBlocks : [sourceText],
    settings.targetLanguage,
  );
  if (translations.length === 0) {
    return;
  }

  const translationNode = existingTranslationNode || document.createElement('div');
  translationNode.className = TRANSLATION_CLASS;
  renderTranslationNode(translationNode, translations);

  if (!existingTranslationNode) {
    element.appendChild(translationNode);
  }

  element.setAttribute(HANDLED_ATTR, '1');
  element.setAttribute(ORIGINAL_ATTR, sourceText);
}

async function processAllMessages() {
  injectStyles();

  const settings = await loadSettings();

  if (!shouldTranslateCurrentRoute(settings, window.location.pathname)) {
    document.querySelectorAll(`.${TRANSLATION_CLASS}`).forEach((node) => node.remove());
    return;
  }

  const elements = Array.from(document.querySelectorAll(MESSAGE_SELECTOR)).filter((element) => {
    const text = getMessageText(element);
    if (!text) {
      return false;
    }

    const parent = element.closest('[data-list-item-id^="chat-messages_"], li, article, [role="article"]');
    return Boolean(parent);
  });

  for (const element of elements) {
    await processElement(element, settings);
  }
}

function scheduleProcess() {
  clearTimeout(processTimer);
  processTimer = window.setTimeout(() => {
    processAllMessages().catch(() => {});
  }, 350);
}

function observeDom() {
  const observer = new MutationObserver(() => {
    scheduleProcess();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

chrome.storage.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes[SETTINGS_KEY]) {
    scheduleProcess();
  }

  const cacheKeysChanged = Object.keys(changes).some((key) => (
    key === cacheApi.CACHE_META_KEY
    || key === LEGACY_STORAGE_CACHE_KEY
    || key.startsWith(cacheApi.CACHE_BUCKET_PREFIX)
  ));

  if (cacheKeysChanged) {
    translationCache.clear();
    cacheLoaded = false;
  }
});

scheduleProcess();
console.info(`${LOG_PREFIX} content script active`);
window.addEventListener('load', scheduleProcess, { once: true });
observeDom();
