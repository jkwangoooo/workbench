import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ES_MODULE_DIRS = ['app'];

const LAYERS = [
  ['core/', 0],
  ['domain/', 1],
  ['io/', 1],
  ['pages/', 2],
  ['ui/', 3]
];

function layerOf(file) {
  const rest = file.replace(/^app\//, '');
  for (const [prefix, layer] of LAYERS) if (rest.startsWith(prefix)) return layer;
  return 4;
}

async function walk(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name).split('\\').join('/');
    if (entry.isDirectory()) found.push(...(await walk(full)));
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

function resolveRelative(fromDir, spec) {
  const stack = [];
  for (const part of `${fromDir}/${spec}`.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

const modules = (await Promise.all(ES_MODULE_DIRS.map((dir) => walk(dir)))).flat().sort();
const known = new Set(modules);
let failures = 0;

for (const file of modules) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures += 1;
    console.log(`语法错误 ${file}`);
    console.log(
      String(error.stderr)
        .split('\n')
        .slice(0, 6)
        .join('\n')
    );
    continue;
  }
  const text = await readFile(file, 'utf8');
  const dir = file.split('/').slice(0, -1).join('/');
  for (const match of text.matchAll(/^\s*import .* from '([^']+)';$/gm)) {
    const resolved = resolveRelative(dir, match[1]);
    if (!known.has(resolved)) {
      failures += 1;
      console.log(`导入路径无法解析 ${file} -> ${match[1]}（期望 ${resolved}）`);
      continue;
    }
    if (layerOf(resolved) > layerOf(file)) {
      failures += 1;
      console.log(`依赖方向错误 ${file} -> ${resolved}（只允许依赖同层或下层）`);
    }
  }
}

const legacy = ['legacy-cloud/app.js'];
for (const file of legacy) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures += 1;
    console.log(`语法错误 ${file}`);
    console.log(
      String(error.stderr)
        .split('\n')
        .slice(0, 6)
        .join('\n')
    );
  }
}

if (failures) {
  console.log(`\n模块检查失败：${failures} 项`);
  process.exit(1);
}
console.log(`模块检查通过（${modules.length} 个本地版模块 + ${legacy.length} 个归档文件）`);
