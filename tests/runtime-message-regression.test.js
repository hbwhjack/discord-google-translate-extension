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

test('content script does not warn on transient runtime channel closure errors', async () => {
  const script = await loadText('src/content.js');

  assert.equal(
    script.includes('console.warn(`${LOG_PREFIX} runtime message failed`'),
    false,
    'transient runtime channel closure should be retried or silenced, not logged as a warning',
  );
});
