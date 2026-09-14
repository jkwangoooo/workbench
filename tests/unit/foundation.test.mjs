import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared contracts contain no student data or browser persistence', async () => {
  const [directory, auth] = await Promise.all([
    readFile('src/shared/student-directory/contracts.ts', 'utf8'),
    readFile('src/shared/auth/session.ts', 'utf8')
  ]);
  assert.match(directory, /StudentDirectoryReader/);
  assert.match(directory, /listActiveByClass/);
  assert.doesNotMatch(directory, /identity|phone|address|score|profile/i);
  assert.match(auth, /createMemorySessionStore/);
  assert.doesNotMatch(auth, /localStorage|sessionStorage|console\./);
});
