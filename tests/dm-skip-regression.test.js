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

test('content script detects Discord DM routes and skips translating them', async () => {
  const script = await loadText('src/content.js');

  assert.equal(
    script.includes("pathname.startsWith('/channels/@me/')"),
    true,
    'DM routes should be detected explicitly so private messages are not translated',
  );
});
