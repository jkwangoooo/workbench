import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || process.env.PORT || 4173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  let path = decodeURIComponent(url.pathname);
  if (path.endsWith('/')) path += 'index.html';
  const target = join(root, normalize(path));
  if (!target.startsWith(root)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      res.writeHead(302, { location: `${path.replace(/\/?$/, '/')}index.html` }).end();
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      'content-type': types[extname(target).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`404 ${path}`);
  }
});

server.listen(port, () => {
  console.log(`班主任工作台本地版：http://localhost:${port}/`);
  console.log(`根目录：${root}`);
});
