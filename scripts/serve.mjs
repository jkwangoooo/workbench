import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || process.env.PORT || 4173);
// 默认只监听本机回环：这个工作台装的是学生真实隐私数据，没有必要让局域网访问。
// 需要手机/平板在同一个 Wi-Fi 下打开时，用 HOST=0.0.0.0 显式放开。
const host = process.env.HOST || '127.0.0.1';

/** 就绪标记，供 launch.mjs 读取；两边必须一致。 */
const READY_MARKER = '__SERVER_READY__';

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

server.on('error', (error) => {
  // 端口被占用时给一句人话，并用退出码 2 让调用方（快捷启动器）知道该换端口重试。
  // 不处理的话这里会变成未捕获异常，堆栈很难看，调用方也分不清是"占用"还是别的错。
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用。`);
    process.exit(2);
  }
  console.error(`静态服务出错：${error.message}`);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`班主任工作台本地版：http://localhost:${port}/`);
  console.log(`根目录：${root}`);
  console.log(`监听：${host}:${port}`);
  // 给调用方（快捷启动器）的就绪信号。不要改成"由调用方去请求首页探测"：
  // 如果这个端口本来就被别的程序占着，对方照样会回 200，调用方会误判成自己起好了。
  console.log(`${READY_MARKER} ${host}:${port}`);
});
