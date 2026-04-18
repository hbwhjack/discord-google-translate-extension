const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = {
  targetLanguage: 'zh-CN',
  translateDirectMessages: false,
  serverFilterMode: 'off',
  serverFilterList: '',
  channelFilterMode: 'off',
  channelFilterList: '',
};

const targetLanguageSelect = document.getElementById('popup-target-language');
const translateDirectMessagesCheckbox = document.getElementById('popup-translate-direct-messages');
const saveButton = document.getElementById('popup-save');
const openSettingsButton = document.getElementById('open-full-settings');
const statusNode = document.getElementById('popup-status');

function normalizeSettings(raw = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
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

function applySettings(settings) {
  targetLanguageSelect.value = settings.targetLanguage;
  translateDirectMessagesCheckbox.checked = settings.translateDirectMessages;
}

async function saveSettings() {
  const current = await loadSettings();
  const settings = {
    ...current,
    targetLanguage: targetLanguageSelect.value,
    translateDirectMessages: translateDirectMessagesCheckbox.checked,
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
  setStatus('Saved.');
}

function setStatus(message) {
  statusNode.textContent = message;
  window.clearTimeout(setStatus.timer);
  setStatus.timer = window.setTimeout(() => {
    statusNode.textContent = '';
  }, 1800);
}

saveButton.addEventListener('click', () => {
  saveSettings().catch((error) => {
    console.error(error);
    setStatus('Save failed.');
  });
});

openSettingsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

loadSettings().then(applySettings).catch((error) => {
  console.error(error);
  setStatus('Load failed.');
});
