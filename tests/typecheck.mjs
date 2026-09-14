import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile('tsconfig.json', 'utf8'));
if (config.compilerOptions?.strict !== true || config.compilerOptions?.noEmit !== true) {
  throw new Error('tsconfig must keep strict/noEmit enabled');
}
const source = await readFile('src/shared/student-directory/contracts.ts', 'utf8');
for (const token of ['StudentDirectoryItem', 'StudentDirectoryReader', 'listActiveByClass', 'getById']) {
  if (!source.includes(token)) throw new Error(`missing type contract token: ${token}`);
}
console.log('type contract check passed');
