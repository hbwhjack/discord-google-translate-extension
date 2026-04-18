import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function loadText(relativePath) {
  return readFile(path.join(projectRoot, relativePath), 'utf8');
}

test('content script does not use overly broad markup selector that duplicates translations', async () => {
  const script = await loadText('src/content.js');

  assert.equal(
    script.includes("'[class*=\"markup_\"]'"),
    false,
    'broad markup selector causes the same Discord message to be translated multiple times',
  );
});
