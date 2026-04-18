const SETTINGS_KEY = 'settings';
const STORAGE_CACHE_KEY = 'translationCache';
const DEFAULT_SETTINGS = {
  targetLanguage: 'zh-CN',
  translateDirectMessages: false,
  serverFilterMode: 'off',
  serverFilterList: '',
  channelFilterMode: 'off',
  channelFilterList: '',
};

const targetLanguageSelect = document.getElementById('target-language');
const translateDirectMessagesCheckbox = document.getElementById('translate-direct-messages');
const serverFilterModeSelect = document.getElementById('server-filter-mode');
const serverFilterListTextarea = document.getElementById('server-filter-list');
const channelFilterModeSelect = document.getElementById('channel-filter-mode');
const channelFilterListTextarea = document.getElementById('channel-filter-list');
const saveButton = document.getElementById('save-settings');
const clearCacheButton = document.getElementById('clear-cache');
const exportButton = document.getElementById('export-settings');
const importFileInput = document.getElementById('import-settings-file');
const statusNode = document.getElementById('status');

function normalizeFilterMode(value, fallback = 'off') {
  return ['off', 'whitelist', 'blacklist'].includes(value) ? value : fallback;
}

function normalizeIdList(value = '') {
  return String(value)
    .split(/[\n,]/)
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

function isCacheEntry(entry) {
  return Boolean(entry && typeof entry.translation === 'string' && typeof entry.updatedAt === 'number');
}

function normalizeCache(raw = {}) {
  return Object.fromEntries(Object.entries(raw || {}).filter(([, value]) => isCacheEntry(value)));
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = normalizeSettings(stored?.[SETTINGS_KEY]);
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

function applySettings(settings) {
  targetLanguageSelect.value = settings.targetLanguage;
  translateDirectMessagesCheckbox.checked = settings.translateDirectMessages;
  serverFilterModeSelect.value = settings.serverFilterMode;
  serverFilterListTextarea.value = settings.serverFilterList;
  channelFilterModeSelect.value = settings.channelFilterMode;
  channelFilterListTextarea.value = settings.channelFilterList;
}

function collectSettingsFromForm() {
  return normalizeSettings({
    targetLanguage: targetLanguageSelect.value,
    translateDirectMessages: translateDirectMessagesCheckbox.checked,
    serverFilterMode: serverFilterModeSelect.value,
    serverFilterList: serverFilterListTextarea.value,
    channelFilterMode: channelFilterModeSelect.value,
    channelFilterList: channelFilterListTextarea.value,
  });
}

async function saveSettings() {
  const settings = collectSettingsFromForm();
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus('Settings saved.');
}

async function clearCache() {
  await chrome.storage.local.remove(STORAGE_CACHE_KEY);
  setStatus('Translation cache cleared.');
}

async function exportSettings() {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, STORAGE_CACHE_KEY]);
  const payload = {
    settings: normalizeSettings(stored?.[SETTINGS_KEY]),
    translationCache: normalizeCache(stored?.[STORAGE_CACHE_KEY]),
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'jb-discord-translate-export.json';
  link.click();
  URL.revokeObjectURL(url);
  setStatus('Export created.');
}

async function importSettings(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const settings = normalizeSettings(parsed?.settings);
  const translationCache = normalizeCache(parsed?.translationCache);
  await chrome.storage.local.set({
    [SETTINGS_KEY]: settings,
    [STORAGE_CACHE_KEY]: translationCache,
  });
  applySettings(settings);
  importFileInput.value = '';
  setStatus('Settings and cache imported.');
}

function setStatus(message) {
  statusNode.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusNode.textContent = '';
  }, 2400);
}

async function init() {
  applySettings(await loadSettings());
}

saveButton.addEventListener('click', () => {
  saveSettings().catch((error) => {
    console.error(error);
    setStatus('Failed to save settings.');
  });
});

clearCacheButton.addEventListener('click', () => {
  clearCache().catch((error) => {
    console.error(error);
    setStatus('Failed to clear cache.');
  });
});

exportButton.addEventListener('click', () => {
  exportSettings().catch((error) => {
    console.error(error);
    setStatus('Failed to export settings.');
  });
});

importFileInput.addEventListener('change', () => {
  const [file] = importFileInput.files || [];
  if (!file) {
    return;
  }

  importSettings(file).catch((error) => {
    console.error(error);
    setStatus('Failed to import settings.');
  });
});

init().catch((error) => {
  console.error(error);
  setStatus('Failed to load settings.');
});
