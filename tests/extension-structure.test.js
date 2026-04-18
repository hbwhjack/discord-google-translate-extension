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

test('content scripts referenced by manifest do not use ESM import syntax', async () => {
  const manifest = await loadJson('manifest.json');
  const contentScripts = manifest.content_scripts.flatMap((entry) => entry.js ?? []);

  for (const scriptPath of contentScripts) {
    const script = await loadText(scriptPath);
    assert.doesNotMatch(
      script,
      /^\s*import\s/m,
      `content script ${scriptPath} uses import syntax and will not run as a classic script`,
    );
  }
});
