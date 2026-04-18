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

test('manifest exposes an options page for extension settings', async () => {
  const manifest = await loadJson('manifest.json');
  assert.equal(manifest.options_page, 'options/options.html');
});

test('content script has settings keys for target language and DM toggle', async () => {
  const script = await loadText('src/content.js');
  assert.equal(script.includes("const SETTINGS_KEY = 'settings';"), true);
  assert.equal(script.includes('translateDirectMessages'), true);
  assert.equal(script.includes('targetLanguage'), true);
});

test('options page provides cache clear control and DM toggle UI', async () => {
  const html = await loadText('options/options.html');
  assert.equal(html.includes('id="translate-direct-messages"'), true);
  assert.equal(html.includes('id="target-language"'), true);
  assert.equal(html.includes('id="clear-cache"'), true);
});
