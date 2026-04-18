import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function loadJson(relativePath) {
  const content = await readFile(path.join(projectRoot, relativePath), 'utf8');
  return JSON.parse(content);
}

async function loadText(relativePath) {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('manifest exposes popup for quick settings', async () => {
  const manifest = await loadJson('manifest.json');
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
});

test('content script supports server and channel filter settings', async () => {
  const script = await loadText('src/content.js');
  assert.equal(script.includes('serverFilterMode'), true);
  assert.equal(script.includes('serverFilterList'), true);
  assert.equal(script.includes('channelFilterMode'), true);
  assert.equal(script.includes('channelFilterList'), true);
});

test('options page exposes filter controls and import export controls', async () => {
  const html = await loadText('options/options.html');
  assert.equal(html.includes('id="server-filter-mode"'), true);
  assert.equal(html.includes('id="channel-filter-mode"'), true);
  assert.equal(html.includes('id="export-settings"'), true);
  assert.equal(html.includes('id="import-settings-file"'), true);
});

test('popup page exposes quick settings controls', async () => {
  const html = await loadText('popup/popup.html');
  assert.equal(html.includes('id="popup-target-language"'), true);
  assert.equal(html.includes('id="popup-translate-direct-messages"'), true);
  assert.equal(html.includes('id="open-full-settings"'), true);
});
