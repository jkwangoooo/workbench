#!/usr/bin/env node
// 班主任工作台 · 快捷启动器
//
// 双击根目录的「启动工作台.cmd」就是跑这个脚本：
//   1. 检查 Node 环境与私有名单（private-data/students.js）
//   2. 补齐构建产物（dist/vendor/xlsx.full.min.js，缺了就从 node_modules 拷）
//   3. 起本地静态服务（优先 4180，被占就向系统要一个空闲端口）
//   4. 自动打开浏览器到 http://127.0.0.1:<端口>/
//   5. 这个窗口留着别关，Ctrl+C 或直接关窗口即停服
//
// 本地版用 ES 模块加载，必须走 HTTP，双击 index.html（file://）跑不起来——这就是本脚本存在的意义。

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_FILE = join(PROJECT_ROOT, 'private-data', 'students.js');
const VENDOR_FILE = join(PROJECT_ROOT, 'dist', 'vendor', 'xlsx.full.min.js');
const VENDOR_SOURCE = join(PROJECT_ROOT, 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js');
const SERVE_ENTRY = join(PROJECT_ROOT, 'scripts', 'serve.mjs');

/** 与 scripts/serve.mjs 约定的就绪标记，两边必须一致。 */
const READY_MARKER = '__SERVER_READY__';

// 4173 在本机被别的应用占着，默认改用 4180；可用环境变量 PORT 覆盖。
const PREFERRED_PORT = Number(process.env.PORT || 4180);

const line = (text = '') => console.log(text);

function bail(message) {
  line('');
  line(`× ${message}`);
  line('');
  // 这里不停顿等按键：双击入口「启动工作台.cmd」在最后统一 pause，
  // 两条路都 pause 会让人连按两次键。直接从终端跑时不 pause 也没关系，报错就在屏幕上。
  process.exitCode = 1;
}

/** 让系统随便给一个空闲端口。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** 缺构建产物就现补，省得用户回去敲 npm run build。 */
function ensureVendor() {
  if (existsSync(VENDOR_FILE)) return null;
  if (!existsSync(VENDOR_SOURCE)) {
    return '缺少 dist/vendor/xlsx.full.min.js，且 node_modules 里也没有 xlsx。请先在项目目录跑一次 npm install。';
  }
  mkdirSync(dirname(VENDOR_FILE), { recursive: true });
  copyFileSync(VENDOR_SOURCE, VENDOR_FILE);
  return `已补齐构建产物：${VENDOR_FILE.split('\\').join('/')}`;
}

function openBrowser(url) {
  // --no-open / NO_OPEN=1：只起服务不开浏览器（脚本化调用或无桌面环境时用）。
  if (process.argv.includes('--no-open') || process.env.NO_OPEN === '1') {
    line('（--no-open：不自动打开浏览器，请手动访问上面的地址）');
    return;
  }
  const commands = {
    win32: ['cmd', ['/c', 'start', '', url]],
    darwin: ['open', [url]],
    linux: ['xdg-open', [url]]
  };
  const [command, args] = commands[process.platform] || commands.linux;
  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  child.on('error', () => line(`（没能自动打开浏览器，请手动访问上面的地址）`));
  child.unref();
}

/** 起服务并等它就绪；就绪后返回子进程。
 *  端口可能刚被别的程序抢走（serve.mjs 会以退出码 2 表示占用），此时自动向系统另要一个空闲端口重试。
 *
 *  就绪判据是 serve.mjs 打在 stdout 的 READY 标记，不是"请求首页拿到 200"：
 *  如果这个端口本来就跑着别的 web 服务，请求首页同样会 200，就会误判成自己起好了。
 */
async function startServer(port, retry = 1) {
  const child = spawn(process.execPath, [SERVE_ENTRY, PROJECT_ROOT, String(port)], {
    cwd: PROJECT_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  const url = `http://127.0.0.1:${port}/`;
  const ready = await waitForReady(child);

  if (ready === 'ok') return { child, port, url };
  if (ready === 'taken' && retry > 0) {
    const spare = await findFreePort();
    line(`· ${port} 端口被占用，改用 ${spare}`);
    return startServer(spare, retry - 1);
  }
  if (ready === 'taken') {
    throw new Error(`${port} 端口被占用，自动换端口也没成功。（可用环境变量 PORT 指定别的端口）`);
  }

  stopServer(child);
  throw new Error(`静态服务启动失败（退出码 ${child.exitCode}）：${stderr.trim() || '无输出'}`);
}

/** 等子进程自报就绪。返回 'ok' | 'taken' | 'fail'。 */
function waitForReady(child) {
  return new Promise((resolve) => {
    let buffer = '';
    let settled = false;
    const done = (verdict) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(verdict);
    };
    const timer = setTimeout(() => done('fail'), 15000);

    child.stdout.on('data', (chunk) => {
      buffer += String(chunk);
      if (buffer.includes(READY_MARKER)) done('ok');
    });
    child.once('exit', (code) => done(code === 2 ? 'taken' : 'fail'));
    child.once('error', () => done('fail'));
  });
}

/** 只收自己拉起的那个进程树，不按进程名通杀。 */
function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }
}

async function main() {
  line('========================================');
  line('  班主任工作台 · 本地版');
  line('========================================');
  line('');

  if (!existsSync(SERVE_ENTRY)) {
    bail(`没找到静态服务脚本：${SERVE_ENTRY}\n  请确认这个脚本放在项目根的 scripts/ 目录下。`);
    return;
  }

  const vendorNote = ensureVendor();
  if (vendorNote && vendorNote.startsWith('缺少')) {
    bail(vendorNote);
    return;
  }
  if (vendorNote) line(`· ${vendorNote}`);

  if (existsSync(SEED_FILE)) {
    line('· 已找到学生名单 private-data/students.js');
  } else {
    line('！ 还没放学生名单：private-data/students.js 不存在，页面会是空的。');
    line('  想先看演示效果，在项目目录跑一次 npm run seed。');
    line('  改用真实名单，把名单文件（CSV/XLSX）拖到 import-roster 上，或手动复制进 private-data/。');
    line('');
  }

  // 先按首选端口起；真被占用时 serve.mjs 会以退出码 2 退出，startServer 自动另要一个端口重试——
  // 绑端口试一次比"先探测再起服务"可靠：探测和真正 listen 之间有空窗，别的程序可能正好插进来。
  let server;
  try {
    server = await startServer(PREFERRED_PORT);
  } catch (error) {
    bail(String(error.message || error));
    return;
  }

  const { child, url: serverUrl } = server;
  line('');
  line(`√ 工作台已启动：${serverUrl}`);
  line('  数据只存在这个浏览器里，不上传任何资料。');
  line('');
  line('  ※ 这个窗口别关，关了服务就停。用完直接关窗口，或按 Ctrl+C。');
  line('');

  openBrowser(serverUrl);

  const shutdown = () => {
    line('');
    line('正在停止服务…');
    stopServer(child);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', () => {
    line('静态服务已退出。');
    process.exit(0);
  });
}

main().catch((error) => bail(`启动失败：${error.message || error}`));