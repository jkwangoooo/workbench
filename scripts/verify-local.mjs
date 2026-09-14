#!/usr/bin/env node
// 本地版真机验收：用本机 Chrome 无头实例走一遍「记待办 → 导出备份 → 清空浏览器存储 → 恢复备份」的
// 完整闭环，外加旧学生 ID 自动迁移的幂等检查、两种视口无横向溢出、控制台无 error / warning。
//
// 用法：npm run verify:local
// 依赖：本机已装 Chrome（或用 CHROME_PATH 指定）。不使用第三方 npm 包。
// 脚本自带临时静态服务器（向系统要空闲端口），结束时按 PID 回收，不会误验收端口上跑着的别的服务。

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPLICIT_APP_URL = process.env.APP_URL ?? null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TODO_TEXT = '验收用待办事项';
const LEGACY_HOMEWORK = { '8:2026-09-14': { 'local-8-1': { rating: '优', note: '' } } };
const BACKUP_FILE_RE = /^workbench-backup-\d{8}-\d{4}\.json$/;

/** 向系统要一个空闲端口，避免撞上恰好跑在 4173 上的别的服务。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** 拉起本项目自己的静态服务器，返回 { child, url }。 */
async function startServer() {
  const port = await findFreePort();
  const url = `http://127.0.0.1:${port}/`;
  const entry = join(PROJECT_ROOT, 'scripts', 'serve.mjs');
  if (!existsSync(entry)) throw new Error(`未找到静态服务器 ${entry}`);

  const child = spawn(process.execPath, [entry, PROJECT_ROOT, String(port)], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore'
  });
  child.on('error', () => {});

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error('静态服务器启动后立即退出。');
    const reachable = await fetch(url)
      .then((response) => response.ok)
      .catch(() => false);
    if (reachable) return { child, url };
    await sleep(250);
  }
  stopProcess(child);
  throw new Error('静态服务器未在预期时间内就绪。');
}

/** 结束自己拉起的进程；Windows 上按 PID 连子进程一起收，不按进程名通杀。 */
function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill();
  }
}

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Google/Chrome/Application/chrome.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'Microsoft/Edge/Application/msedge.exe'),
    process.env['ProgramFiles(x86)'] && join(process.env['ProgramFiles(x86)'], 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('未找到 Chrome / Edge，请用 CHROME_PATH 指定浏览器可执行文件。');
  return found;
}

async function launchBrowser(browserPath, userDataDir) {
  const child = spawn(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-sandbox',
      '--remote-debugging-port=0',
      `--user-data-dir=${userDataDir}`,
      'about:blank'
    ],
    { stdio: 'ignore' }
  );

  const portFile = join(userDataDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (existsSync(portFile)) {
      const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
      if (port) return { child, port };
    }
    await sleep(250);
  }
  child.kill();
  throw new Error('浏览器调试端口未在预期时间内就绪。');
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connect(port) {
  let target;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      target = targets.find((item) => item.type === 'page');
      if (target) break;
    } catch {
      // 调试端点尚未就绪
    }
    await sleep(250);
  }
  if (!target) throw new Error('无法连接浏览器调试端点。');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败。')), { once: true });
  });
  return new Cdp(ws);
}

// 页面内交互辅助。依赖界面上的可见文案，不依赖内部类名到了脆弱的地步；
// 一旦改文案，这里要同步改。
const HELPERS = `
window.__m = {
  byText: (text, tag) => [...document.querySelectorAll(tag || 'button')].find((el) => el.textContent.trim() === text),
  clickText: (text, tag) => { const el = window.__m.byText(text, tag); if (!el) return 'NOT_FOUND:' + text; el.click(); return 'OK' },
  setValue: (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  // 本项目的字段结构是 <div class="local-field"><label>…</label><input></div>，
  // label 与 input 是兄弟节点，所以要先找到 label 所在的字段容器再找控件。
  fieldInput: (labelText) => {
    const label = [...document.querySelectorAll('label')].find((item) => item.textContent.includes(labelText));
    if (!label) return null;
    const scope = label.closest('.local-field') || label.parentElement;
    return label.querySelector('input, textarea, select') || (scope && scope.querySelector('input, textarea, select')) || null;
  },
  fill: (labelText, value) => {
    const input = window.__m.fieldInput(labelText);
    if (!input) return 'NO_INPUT:' + labelText;
    window.__m.setValue(input, value);
    return 'OK';
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  text: () => document.body.innerText,
  store: (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null } },
};
'ready'
`;

const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  → ${detail}` : ''}`);
}
function firstLine(value, limit = 100) {
  return String(value ?? '').split('\n').filter(Boolean).join(' / ').slice(0, limit);
}

const stamp = Date.now();

async function main() {
  const browserPath = findBrowser();
  const userDataDir = join(tmpdir(), `verify-chrome-${stamp}`);
  const downloadDir = join(tmpdir(), `verify-download-${stamp}`);
  mkdirSync(downloadDir, { recursive: true });
  let child = null;
  let server = null;

  try {
    let appUrl = EXPLICIT_APP_URL;
    if (appUrl) {
      const reachable = await fetch(appUrl)
        .then(() => true)
        .catch(() => false);
      if (!reachable) {
        console.error(`APP_URL 指定的 ${appUrl} 无法访问。`);
        process.exitCode = 1;
        return;
      }
    } else {
      server = await startServer();
      appUrl = server.url;
      console.log(`使用临时静态服务器：${appUrl}\n`);
    }

    const launched = await launchBrowser(browserPath, userDataDir);
    child = launched.child;
    const cdp = await connect(launched.port);
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp
      .send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir, eventsEnabled: true })
      .catch(() => cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir }));

    const evaluate = async (expression) => {
      const outcome = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (outcome.exceptionDetails) {
        throw new Error(outcome.exceptionDetails.exception?.description ?? outcome.exceptionDetails.text);
      }
      return outcome.result.value;
    };
    const goto = async () => {
      await cdp.send('Page.navigate', { url: appUrl });
      await sleep(1800);
      await evaluate(HELPERS);
    };
    const text = () => evaluate('window.__m.text()');
    const click = async (label, tag) => {
      const outcome = await evaluate(`window.__m.clickText(${JSON.stringify(label)}, ${tag ? JSON.stringify(tag) : 'undefined'})`);
      if (outcome !== 'OK') throw new Error(`点不到「${label}」：${outcome}`);
      await sleep(700);
    };
    /** 导出会异步落盘，等文件出现且不再增长。 */
    const waitForDownload = async () => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const hit = readdirSync(downloadDir).find((name) => BACKUP_FILE_RE.test(name));
        if (hit) {
          const path = join(downloadDir, hit);
          const first = readFileSync(path).length;
          await sleep(250);
          if (readFileSync(path).length === first && first > 0) return path;
        }
        await sleep(250);
      }
      return null;
    };

    // 1. 首页
    await goto();
    const home = await text();
    record('首页渲染工作台外壳', home.includes('班主任工作台') && home.includes('今日看板'), firstLine(home, 80));

    // 2. 空数据下也能新增待办（此前按钮只在「有未完成待办」时才渲染，是条死路）
    const added = await evaluate(`
      (async () => {
        const open = window.__m.byText('新增待办');
        if (!open) return 'NO_BUTTON';
        open.click();
        await window.__m.wait(500);
        const title = (document.querySelector('.local-modal h3') || {}).textContent || '';
        const filled = window.__m.fill('事项内容', ${JSON.stringify(TODO_TEXT)});
        await window.__m.wait(200);
        const save = window.__m.byText('保存待办');
        if (!save) return 'NO_SAVE';
        save.click();
        await window.__m.wait(1000);
        return JSON.stringify({ title, filled, body: document.body.innerText });
      })()
    `);
    const addedData = JSON.parse(added);
    record(
      '无未完成待办时仍可新增待办',
      addedData.title === '新增待办' && addedData.filled === 'OK' && addedData.body.includes(TODO_TEXT),
      `弹窗标题=${addedData.title}, 填写=${addedData.filled}, 看板可见=${addedData.body.includes(TODO_TEXT)}`
    );

    // 3. 导出备份
    await click('数据与备份');
    const dataPage = await text();
    record(
      '数据与备份页给出导出、概览与恢复三块',
      ['备份状态', '数据概览', '恢复备份', '还没有导出过备份'].every((piece) => dataPage.includes(piece)),
      firstLine(dataPage, 80)
    );

    await click('导出全部数据');
    const backupPath = await waitForDownload();
    record('点击导出后真实落盘一个备份文件', Boolean(backupPath), backupPath ? backupPath.split(/[\\/]/).pop() : '超时未见文件');
    if (!backupPath) throw new Error('导出未产出文件，后续恢复检查无法进行。');

    const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
    const appField = backup.app === 'teacher-workbench' && Number(backup.schema) >= 1;
    record(
      '备份头部带应用标识与结构版本',
      appField && typeof backup.exportedAt === 'string' && !Number.isNaN(Date.parse(backup.exportedAt)),
      `app=${backup.app}, schema=${backup.schema}, exportedAt=${backup.exportedAt}`
    );

    const todosKey = 'teacher-local-todos';
    const metaKey = 'teacher-local-meta';
    const backupKeys = Object.keys(backup.data || {});
    const todosInBackup = (backup.data && backup.data[todosKey]) || [];
    record(
      '备份带走刚记的待办，且不含本机专用键',
      todosInBackup.some((item) => item.text === TODO_TEXT) && !backupKeys.includes(metaKey),
      `数据键 ${backupKeys.length} 个，待办 ${todosInBackup.length} 条，含 meta=${backupKeys.includes(metaKey)}`
    );

    record(
      '备份记下学生名单指纹供恢复前核对',
      backup.roster && Number(backup.roster.count8) > 0 && /^[0-9a-f]{8}$/.test(backup.roster.fingerprint || ''),
      `8班 ${backup.roster?.count8} 人 / 7班 ${backup.roster?.count7} 人，指纹 ${backup.roster?.fingerprint}`
    );

    // 4. 模拟「清缓存」
    await evaluate(`localStorage.clear(); 'cleared'`);
    await goto();
    const wiped = await text();
    record('清空浏览器存储后数据确实消失', !wiped.includes(TODO_TEXT) && wiped.includes('暂时没有未完成待办'), firstLine(wiped, 80));

    // 5. 导入备份
    await click('数据与备份');
    const dom = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const node = await cdp.send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '[data-backup-file]' });
    if (!node.nodeId) throw new Error('数据与备份页应有选择备份文件的输入框。');
    await cdp.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [backupPath] });
    await sleep(1200);
    const preview = await text();
    record(
      '选中备份文件后给出恢复预览与名单核对',
      preview.includes('备份导出时间') && preview.includes('学生名单核对通过') && preview.includes('确认恢复（覆盖当前数据）'),
      firstLine(preview, 100)
    );

    await click('确认恢复（覆盖当前数据）');
    const restoredPage = await text();
    await click('今日看板');
    const restoredHome = await text();
    record(
      '确认恢复后数据回到看板',
      restoredPage.includes('数据概览') && restoredHome.includes(TODO_TEXT),
      `看板可见=${restoredHome.includes(TODO_TEXT)}`
    );

    await goto();
    const afterReload = await text();
    record('刷新后恢复的数据仍在（已落进本地存储）', afterReload.includes(TODO_TEXT), firstLine(afterReload, 80));

    // 6. 旧学生 ID 自动迁移：把旧格式数据塞进存储，并抹掉迁移标记
    await evaluate(`
      (() => {
        localStorage.removeItem(${JSON.stringify(metaKey)});
        localStorage.setItem('teacher-local-homework', JSON.stringify(${JSON.stringify(LEGACY_HOMEWORK)}));
        localStorage.setItem('teacher-local-tests', JSON.stringify([{ id: 'test-legacy', title: '迁移样例', scores: { 'local-8-2': 90 }, references: {} }]));
        return 'seeded';
      })()
    `);
    await goto();
    const migrated = await evaluate(`
      JSON.stringify({
        homework: Object.keys((window.__m.store('teacher-local-homework') || {})['8:2026-09-14'] || {}),
        scores: Object.keys(((window.__m.store('teacher-local-tests') || [])[0] || {}).scores || {}),
        schema: (window.__m.store(${JSON.stringify(metaKey)}) || {}).studentIdSchema,
        at: (window.__m.store(${JSON.stringify(metaKey)}) || {}).studentIdMigratedAt,
      })
    `);
    const migratedData = JSON.parse(migrated);
    const allStable = [...migratedData.homework, ...migratedData.scores].every((id) => /^local-8-[0-9a-f]{8}$/.test(id));
    record(
      '启动时把旧序号 ID 自动迁移为稳定 ID',
      allStable && migratedData.schema === 'student-id-v1' && migratedData.homework.length === 1,
      `作业反馈键=${JSON.stringify(migratedData.homework)}, 成绩键=${JSON.stringify(migratedData.scores)}`
    );

    await goto();
    const second = JSON.parse(
      await evaluate(`
        JSON.stringify({
          homework: Object.keys((window.__m.store('teacher-local-homework') || {})['8:2026-09-14'] || {}),
          at: (window.__m.store(${JSON.stringify(metaKey)}) || {}).studentIdMigratedAt,
        })
      `)
    );
    record(
      '迁移幂等：再次启动不再改动',
      JSON.stringify(second.homework) === JSON.stringify(migratedData.homework) && second.at === migratedData.at,
      `键=${JSON.stringify(second.homework)}, 标记时间未变=${second.at === migratedData.at}`
    );

    // 7. 视口
    for (const [label, width, height] of [
      ['桌面 1440x900', 1440, 900],
      ['手机 390x844', 390, 844]
    ]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
      await sleep(800);
      const metrics = JSON.parse(
        await evaluate(`JSON.stringify({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth })`)
      );
      record(`${label} 无横向溢出`, metrics.scroll <= metrics.inner + 1, `scrollWidth=${metrics.scroll}, innerWidth=${metrics.inner}`);
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    // 8. 控制台
    const noisy = cdp.events.filter((event) => {
      if (event.method === 'Runtime.exceptionThrown') return true;
      if (event.method === 'Log.entryAdded') return ['error', 'warning'].includes(event.params.entry.level);
      if (event.method === 'Runtime.consoleAPICalled') return ['error', 'warning'].includes(event.params.type);
      return false;
    });
    record(
      '控制台无 error / warning',
      noisy.length === 0,
      noisy
        .slice(0, 3)
        .map((event) => {
          const entry = event.params.entry ?? {};
          const where = entry.url ? ` @ ${entry.url}` : '';
          return `${entry.text ?? event.params.exceptionDetails?.text ?? event.params.type}${where}`;
        })
        .join(' | ')
    );

    const failed = results.filter((item) => !item.ok);
    console.log('');
    console.log(`结果：${results.length - failed.length}/${results.length} 通过`);
    if (failed.length) {
      console.log('未通过：');
      failed.forEach((item) => console.log(`  - ${item.name}`));
      process.exitCode = 1;
    }
  } finally {
    if (child) child.kill();
    stopProcess(server?.child ?? null);
    await sleep(500);
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(downloadDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error('验收脚本异常：', error.message);
  process.exitCode = 2;
});
