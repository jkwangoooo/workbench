import { copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// 把浏览器端第三方依赖拷进构建产物目录。
// 用法：node scripts/copy-browser-deps.mjs [outDir]（默认 dist，相对仓库根）
const projectRoot = join(import.meta.dirname, '..');
const outDir = resolve(projectRoot, process.argv[2] || 'dist');
const vendorDir = join(outDir, 'vendor');

await mkdir(vendorDir, { recursive: true });
await copyFile(join(projectRoot, 'node_modules/xlsx/dist/xlsx.full.min.js'), join(vendorDir, 'xlsx.full.min.js'));
console.log(`已拷贝浏览器依赖到 ${vendorDir.split('\\').join('/')}`);
