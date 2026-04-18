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
const STORAGE_CACHE_KEY = 'translationCache';
const CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const BLOCK_TAGS = new Set(['DIV', 'P', 'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
const translationCache = new Map();
let cacheLoaded = false;
let processTimer = null;

function isGuildChannelRoute(pathname = window.location.pathname) {
  if (!pathname.startsWith('/channels/')) {
    return false;
  }

  if (pathname.startsWith('/channels/@me/')) {
    return false;
  }

  const parts = pathname.split('/').filter(Boolean);
  return parts.length >= 3;
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
    Object.entries(entries).filter(([, entry]) => isCacheEntryFresh(entry, now)),
  );
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

  const stored = await storage.get(STORAGE_CACHE_KEY);
  const prunedEntries = pruneExpiredEntries(stored?.[STORAGE_CACHE_KEY]);

  translationCache.clear();
  for (const [key, entry] of Object.entries(prunedEntries)) {
    translationCache.set(key, entry);
  }

  await storage.set({ [STORAGE_CACHE_KEY]: prunedEntries });
}

async function persistCache() {
  const storage = getStorageArea();
  if (!storage) {
    return;
  }

  const entries = Object.fromEntries(translationCache.entries());
  const prunedEntries = pruneExpiredEntries(entries);

  translationCache.clear();
  for (const [key, entry] of Object.entries(prunedEntries)) {
    translationCache.set(key, entry);
  }

  await storage.set({ [STORAGE_CACHE_KEY]: prunedEntries });
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

async function requestTranslation(text) {
  await loadPersistentCache();

  const cacheKey = buildCacheKey(text, DEFAULT_TARGET_LANG);
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
    const response = await fetch(buildGoogleTranslateUrl(part, DEFAULT_TARGET_LANG), {
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

  translationCache.set(cacheKey, {
    translation,
    updatedAt: Date.now(),
  });
  await persistCache();
  return translation;
}

async function requestTranslations(textBlocks) {
  const translations = [];

  for (const block of textBlocks) {
    if (!shouldTranslateText(block)) {
      continue;
    }

    const translated = await requestTranslation(block);
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

async function processElement(element) {
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

  const translations = await requestTranslations(sourceBlocks.length > 0 ? sourceBlocks : [sourceText]);
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

  if (!isGuildChannelRoute()) {
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
    await processElement(element);
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

scheduleProcess();
console.info(`${LOG_PREFIX} content script active`);
window.addEventListener('load', scheduleProcess, { once: true });
observeDom();
