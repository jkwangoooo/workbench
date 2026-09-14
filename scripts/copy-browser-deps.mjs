import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/vendor', { recursive: true });
await copyFile('node_modules/xlsx/dist/xlsx.full.min.js', 'dist/vendor/xlsx.full.min.js');
