const SETTINGS_KEY = 'settings';
const STORAGE_CACHE_KEY = 'translationCache';
const DEFAULT_SETTINGS = {
  targetLanguage: 'zh-CN',
  translateDirectMessages: false,
};

const targetLanguageSelect = document.getElementById('target-language');
const translateDirectMessagesCheckbox = document.getElementById('translate-direct-messages');
const saveButton = document.getElementById('save-settings');
const clearCacheButton = document.getElementById('clear-cache');
const statusNode = document.getElementById('status');

function normalizeSettings(raw = {}) {
  return {
    targetLanguage: typeof raw.targetLanguage === 'string' && raw.targetLanguage.trim()
      ? raw.targetLanguage.trim()
      : DEFAULT_SETTINGS.targetLanguage,
    translateDirectMessages: Boolean(raw.translateDirectMessages),
  };
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = normalizeSettings(stored?.[SETTINGS_KEY]);
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

async function saveSettings() {
  const settings = normalizeSettings({
    targetLanguage: targetLanguageSelect.value,
    translateDirectMessages: translateDirectMessagesCheckbox.checked,
  });
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  setStatus('Settings saved.');
}

async function clearCache() {
  await chrome.storage.local.remove(STORAGE_CACHE_KEY);
  setStatus('Translation cache cleared.');
}

function setStatus(message) {
  statusNode.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusNode.textContent = '';
  }, 2200);
}

async function init() {
  const settings = await loadSettings();
  targetLanguageSelect.value = settings.targetLanguage;
  translateDirectMessagesCheckbox.checked = settings.translateDirectMessages;
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

init().catch((error) => {
  console.error(error);
  setStatus('Failed to load settings.');
});
