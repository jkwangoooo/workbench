import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const config = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
if (config.compilerOptions?.strict !== true || config.compilerOptions?.noEmit !== true) {
  throw new Error('tsconfig must keep strict/noEmit enabled');
}
const source = await readFile(join(root, 'src/shared/student-directory/contracts.ts'), 'utf8');
for (const token of ['StudentDirectoryItem', 'StudentDirectoryReader', 'listActiveByClass', 'getById']) {
  if (!source.includes(token)) throw new Error(`missing type contract token: ${token}`);
}
console.log('type contract check passed');
