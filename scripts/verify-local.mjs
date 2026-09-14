#!/usr/bin/env node
// 本地版真机验收：用本机 Chrome 无头实例走一遍「记待办 → 导出备份 → 清空浏览器存储 → 恢复备份」的
// 完整闭环，外加旧学生 ID 自动迁移的幂等检查、两种视口无横向溢出、控制台无 error / warning。
//
// 用法：npm run verify:local
// 依赖：本机已装 Chrome（或用 CHROME_PATH 指定）。不使用第三方 npm 包。
// 脚本自带临时静态服务器（向系统要空闲端口），结束时按 PID 回收，不会误验收端口上跑着的别的服务。

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXPLICIT_APP_URL = process.env.APP_URL ?? null;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const TODO_TEXT = '验收用待办事项';
const VIOLATION_TEXT = '课堂讲话';
const VIOLATION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HOMEWORK_TEXT = '第一课词语抄写';
const HOMEWORK_TEXT_2 = '第二课背诵';
const HOMEWORK_NOTE = '没带作业本';
const INTERVIEW_NOTE = '面谈表现积极';
const LEGACY_HOMEWORK = { '8:2026-09-14': { 'local-8-1': { rating: '优', note: '' } } };
const BACKUP_FILE_RE = /^workbench-backup-\d{8}-\d{4}\.json$/;
const WORK_FILE_NAME = '验收用工作文件.txt';
const PREP_URL = 'https://prep.example.com/';

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
  setSelect: (el, value) => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  },
  clickSel: (selector) => {
    const el = document.querySelector(selector);
    if (!el) return 'NOT_FOUND:' + selector;
    el.click();
    return 'OK';
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
      todosInBackup.some((item) => (item.content ?? item.text) === TODO_TEXT) && !backupKeys.includes(metaKey),
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

    // 6. 违纪页（L1）：全班逐行录入、真打字即置顶且不丢焦点、整批保存、清空即删除
    await click('违纪记录');
    const grid = JSON.parse(
      await evaluate(`
        JSON.stringify({
          rows: document.querySelectorAll('[data-violation-row]').length,
          inputs: document.querySelectorAll('[data-violation-student]').length,
          hasSave: !!window.__m.byText('保存当天违纪'),
          hasDate: !!document.querySelector('[data-violation-picker]'),
        })
      `)
    );
    record(
      '违纪页把 8 班全班铺成一行一人，没有弹窗',
      grid.rows === grid.inputs && grid.rows > 10 && grid.hasSave && grid.hasDate,
      `行数=${grid.rows}，输入框=${grid.inputs}，保存按钮=${grid.hasSave}`
    );

    // 拿最后一名学生做目标：它一开始排在队尾，置顶效果一眼可见
    const target = JSON.parse(
      await evaluate(`
        (() => {
          const rows = [...document.querySelectorAll('[data-violation-row]')];
          const row = rows[rows.length - 1];
          const input = row.querySelector('[data-violation-student]');
          const index = rows.indexOf(row);
          return JSON.stringify({
            name: row.querySelector('.local-violation-name').textContent,
            studentId: input.getAttribute('data-violation-student'),
            origin: index,
          });
        })()
      `)
    );

    // 真·键盘输入：走 CDP 聚焦 + 插入文本，才能验出「输入后行移动但焦点和光标没丢」
    const gridDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const gridNodes = await cdp.send('DOM.querySelectorAll', { nodeId: gridDoc.root.nodeId, selector: '[data-violation-student]' });
    const lastInput = gridNodes.nodeIds[gridNodes.nodeIds.length - 1];
    await cdp.send('DOM.focus', { nodeId: lastInput });
    await cdp.send('Input.insertText', { text: VIOLATION_TEXT });
    await sleep(800);

    const typed = JSON.parse(
      await evaluate(`
        (() => {
          // 用实际渲染位置判断谁在最上面，而不是看 DOM 顺序 —— 置顶只要视觉上成立就够了
          const rows = [...document.querySelectorAll('[data-violation-row]')];
          const top = rows.reduce((best, row) => (row.getBoundingClientRect().top < best.getBoundingClientRect().top ? row : best), rows[0]);
          const active = document.activeElement;
          return JSON.stringify({
            value: active && active.value,
            focused: active ? active.getAttribute('data-violation-student') : '',
            topRow: top.querySelector('.local-violation-name').textContent,
            topValue: top.querySelector('[data-violation-student]').value,
            meta: (document.querySelector('[data-violation-meta]') || {}).textContent || '',
          });
        })()
      `)
    );
    record(
      '输入即有内容的学生置顶，且焦点与光标没被夺走',
      typed.value === VIOLATION_TEXT && typed.focused === target.studentId && typed.topRow === target.name && typed.meta.includes('未保存'),
      `编辑前在第 ${target.origin + 1} 行，现在最上面的是「${typed.topRow}」；焦点仍在=${typed.focused ? '是' : '否'}；提示=${typed.meta}`
    );

    await click('保存当天违纪');
    const savedViolations = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-violations')`));
    record(
      '整批保存写成新形态（稳定学生 ID + 日期 + 内容 + 三个时间戳）',
      savedViolations.length === 1 &&
        savedViolations[0].studentId === target.studentId &&
        savedViolations[0].content === VIOLATION_TEXT &&
        VIOLATION_DATE_RE.test(savedViolations[0].eventDate) &&
        Boolean(savedViolations[0].lastRecordedAt && savedViolations[0].createdAt && savedViolations[0].updatedAt) &&
        !('student' in savedViolations[0]) &&
        !('text' in savedViolations[0]),
      `记录=${JSON.stringify(savedViolations[0]).slice(0, 120)}`
    );

    await goto();
    await click('违纪记录');
    const persisted = JSON.parse(
      await evaluate(`
        (() => {
          const first = document.querySelector('[data-violation-row]');
          return JSON.stringify({
            firstRow: first ? first.querySelector('.local-violation-name').textContent : '',
            firstValue: first ? first.querySelector('[data-violation-student]').value : '',
            meta: (document.querySelector('[data-violation-meta]') || {}).textContent || '',
          });
        })()
      `)
    );
    record(
      '刷新后该生仍置顶、文字仍在、且不再算未保存',
      persisted.firstRow === target.name && persisted.firstValue === VIOLATION_TEXT && !persisted.meta.includes('未保存'),
      `首行=${persisted.firstRow}，内容=${persisted.firstValue}`
    );

    // 键盘全选清空 + 保存 = 删除这条记录
    const clearDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const clearNode = await cdp.send('DOM.querySelector', { nodeId: clearDoc.root.nodeId, selector: '[data-violation-student]' });
    await cdp.send('DOM.focus', { nodeId: clearNode.nodeId });
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    }
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    }
    await sleep(600);
    const cleared = await evaluate(`(document.activeElement || {}).value`);
    await click('保存当天违纪');
    const afterClear = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-violations')`));

    await goto();
    await click('违纪记录');
    const reloaded = JSON.parse(
      await evaluate(`
        (() => {
          const rows = [...document.querySelectorAll('[data-violation-row]')];
          const last = rows[rows.length - 1];
          return JSON.stringify({
            count: rows.length,
            firstValue: rows[0].querySelector('[data-violation-student]').value,
            lastRow: last ? last.querySelector('.local-violation-name').textContent : '',
          });
        })()
      `)
    );
    record(
      '清空并保存即删除，刷新后不复活且该生回到花名册顺序',
      cleared === '' && afterClear.length === 0 && reloaded.firstValue === '' && reloaded.lastRow === target.name,
      `清空后存储条数=${afterClear.length}，刷新后末行=${reloaded.lastRow}`
    );

    // 6.5 作业与反馈（L2）：三条固定作业域、选中展开全班反馈表、保存两张表、清空二次确认级联删
    await click('作业反馈');
    const hwShell = JSON.parse(
      await evaluate(`
        JSON.stringify({
          slots: document.querySelectorAll('[data-homework-content]').length,
          slotButtons: [...document.querySelectorAll('[class*="homework-slot"]')].filter((el) => el.tagName === 'BUTTON' || el.matches('[data-action*="homework-slot"]')).length,
          hasSave: !!window.__m.byText('保存本条作业反馈'),
          hasClass: !!document.querySelector('[data-homework-class]'),
          hasDate: !!document.querySelector('[data-homework-picker]'),
        })
      `)
    );
    record(
      '作业页展示三条固定作业行与保存按钮',
      hwShell.slots === 3 && hwShell.hasSave && hwShell.hasClass && hwShell.hasDate,
      `内容框=${hwShell.slots}，保存=${hwShell.hasSave}`
    );

    // 填写第 1 条作业内容
    const hwContentDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const hwContentNodes = await cdp.send('DOM.querySelectorAll', { nodeId: hwContentDoc.root.nodeId, selector: '[data-homework-content]' });
    const firstContentNode = hwContentNodes.nodeIds[0];
    await cdp.send('DOM.focus', { nodeId: firstContentNode });
    await cdp.send('Input.insertText', { text: HOMEWORK_TEXT });
    await sleep(800);

    // 选中第 1 条作业
    await evaluate(`window.__m.clickSel('[data-action="homework-slot:1"]')`);
    await sleep(700);
    const hwTable = JSON.parse(
      await evaluate(`
        JSON.stringify({
          rows: document.querySelectorAll('[data-homework-rating]').length,
          firstRating: (() => { const el = document.querySelector('[data-homework-rating]'); return el ? el.value : ''; })(),
          hasNote: !!document.querySelector('[data-homework-note]'),
        })
      `)
    );
    record(
      '选中第 1 条后展开全班反馈表，默认评级为「优」',
      hwTable.rows > 10 && hwTable.firstRating === '优' && hwTable.hasNote,
      `反馈行=${hwTable.rows}，默认评级=${hwTable.firstRating}`
    );

    // 改第 1 名学生状态为"差"并加备注
    const hwRatingDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const hwRatingNodes = await cdp.send('DOM.querySelectorAll', { nodeId: hwRatingDoc.root.nodeId, selector: '[data-homework-rating]' });
    await cdp.send('DOM.focus', { nodeId: hwRatingNodes.nodeIds[0] });
    await evaluate(`window.__m.setSelect(document.querySelector('[data-homework-rating]'), '差')`);
    await sleep(400);

    const hwNoteDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const hwNoteNodes = await cdp.send('DOM.querySelectorAll', { nodeId: hwNoteDoc.root.nodeId, selector: '[data-homework-note]' });
    await cdp.send('DOM.focus', { nodeId: hwNoteNodes.nodeIds[0] });
    await cdp.send('Input.insertText', { text: HOMEWORK_NOTE });
    await sleep(600);

    // 保存
    await click('保存本条作业反馈');
    const savedHw = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-homework')`));
    const hasTasks = Array.isArray(savedHw.tasks) && savedHw.tasks.length >= 1;
    const hasFeedback = Array.isArray(savedHw.feedback) && savedHw.feedback.length >= 1;
    const task1 = hasTasks ? savedHw.tasks.find((t) => t.slot === 1) : null;
    const fb1 = hasFeedback ? savedHw.feedback.find((f) => f.rating === '差') : null;
    record(
      '保存后写入 v2 两张表：tasks 含第 1 条、feedback 含「差」+备注',
      hasTasks && hasFeedback && task1 && task1.content === HOMEWORK_TEXT && fb1 && fb1.note === HOMEWORK_NOTE,
      `tasks=${savedHw.tasks?.length ?? 0}, feedback=${savedHw.feedback?.length ?? 0}, task1.content=${task1?.content}, fb1.note=${fb1?.note}`
    );

    // 刷新后重进作业页，数据读回
    await goto();
    await click('作业反馈');
    await evaluate(`window.__m.clickSel('[data-action="homework-slot:1"]')`);
    await sleep(700);
    const reloadedHw = JSON.parse(
      await evaluate(`
        JSON.stringify({
          content1: (() => { const els = document.querySelectorAll('[data-homework-content]'); return els[0] ? els[0].value : ''; })(),
          firstRating: (() => { const el = document.querySelector('[data-homework-rating]'); return el ? el.value : ''; })(),
          firstNote: (() => { const el = document.querySelector('[data-homework-note]'); return el ? el.value : ''; })(),
        })
      `)
    );
    record(
      '刷新后重进作业页：第 1 条内容、评级、备注均正确读回',
      reloadedHw.content1 === HOMEWORK_TEXT && reloadedHw.firstRating === '差' && reloadedHw.firstNote === HOMEWORK_NOTE,
      `content=${reloadedHw.content1}, rating=${reloadedHw.firstRating}, note=${reloadedHw.firstNote}`
    );

    // 清空第 1 条内容 → 有反馈应弹二次确认
    const clearHwDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const clearHwNodes = await cdp.send('DOM.querySelectorAll', { nodeId: clearHwDoc.root.nodeId, selector: '[data-homework-content]' });
    await cdp.send('DOM.focus', { nodeId: clearHwNodes.nodeIds[0] });
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
    }
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', { type, key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
    }
    await sleep(600);
    await click('保存本条作业反馈');
    const confirmDialog = JSON.parse(
      await evaluate(`
        JSON.stringify({
          modalVisible: !!document.querySelector('.local-modal'),
          modalText: (document.querySelector('.local-modal') || {}).innerText || '',
        })
      `)
    );
    record(
      '清空有反馈的作业内容后弹出二次确认弹窗',
      confirmDialog.modalVisible && confirmDialog.modalText.includes('永久删除'),
      `弹窗可见=${confirmDialog.modalVisible}，文案片段=${confirmDialog.modalText.slice(0, 60)}`
    );

    // 确认删除
    await click('确认删除这条作业');
    await sleep(700);
    const afterDeleteHw = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-homework')`));
    const remainingTasks = (afterDeleteHw.tasks || []).filter((t) => t.slot === 1).length;
    const remainingFb = (afterDeleteHw.feedback || []).filter((f) => f.homeworkId && f.homeworkId.includes('-1-')).length;
    record(
      '确认后第 1 条任务与对应反馈被级联删除',
      remainingTasks === 0 && remainingFb === 0,
      `剩余 slot=1 任务=${remainingTasks}，剩余相关反馈=${remainingFb}`
    );

    // 其余两条不受影响
    const otherSlots = (afterDeleteHw.tasks || []).length;
    record(
      '其余作业条目不受影响',
      otherSlots === 0,
      `剩余总任务数=${otherSlots}（清空前只有 1 条有内容的任务）`
    );

    // 6.6 学生面谈（L3）：工作周、勾选+备注、整批保存成 v1、取消勾选保留备注、清空即删除
    await click('学生面谈');
    const ivShell = JSON.parse(
      await evaluate(`
        JSON.stringify({
          hasSave: !!window.__m.byText('保存本周面谈'),
          hasClass: !!document.querySelector('[data-interview-class]'),
          hasWeek: !!document.querySelector('[data-interview-week]'),
          rows: document.querySelectorAll('[data-interview-check]').length,
        })
      `)
    );
    record(
      '面谈页有班级/工作周选择、保存按钮与全班勾选行',
      ivShell.hasSave && ivShell.hasClass && ivShell.hasWeek && ivShell.rows > 10,
      `勾选行=${ivShell.rows}`
    );

    // 勾选第一名 + 备注
    const ivCheckDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const ivCheckNodes = await cdp.send('DOM.querySelectorAll', { nodeId: ivCheckDoc.root.nodeId, selector: '[data-interview-check]' });
    await cdp.send('DOM.focus', { nodeId: ivCheckNodes.nodeIds[0] });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await sleep(300);
    const ivNoteDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const ivNoteNodes = await cdp.send('DOM.querySelectorAll', { nodeId: ivNoteDoc.root.nodeId, selector: '[data-interview-note]' });
    await cdp.send('DOM.focus', { nodeId: ivNoteNodes.nodeIds[0] });
    await cdp.send('Input.insertText', { text: INTERVIEW_NOTE });
    await sleep(400);
    await click('保存本周面谈');
    const savedIv = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-interviews')`));
    const ivRec = savedIv && Array.isArray(savedIv.interviews) ? savedIv.interviews.find((r) => r.completed === true) : null;
    record(
      '面谈勾选+备注保存成 v1 数组',
      savedIv && savedIv.version === 1 && ivRec && ivRec.note === INTERVIEW_NOTE,
      `version=${savedIv?.version}, 备注=${ivRec?.note}`
    );

    // 6.7 每日待办（L4）：14 天窗口 + 待确认区 + 逾期整理 + 选日期安排
    // 先塞一条逾期未完成的旧形态待办，进待办页应自动移入待确认
    await evaluate(`
      localStorage.setItem('teacher-local-todos', JSON.stringify([
        { id: 'todo-overdue', text: '过期待办验收', due: '2020-01-01', done: false }
      ]));
      'seeded'
    `);
    await click('每日待办');
    const todoPage = JSON.parse(
      await evaluate(`
        JSON.stringify({
          title: (document.querySelector('.local-title') || {}).textContent || '',
          hasPending: !!document.querySelector('[data-todo-schedule]'),
          hasToday: document.body.innerText.includes('（今天）'),
        })
      `)
    );
    record(
      '待办页有 14 天窗口与待确认区',
      todoPage.title === '每日待办' && todoPage.hasPending && todoPage.hasToday,
      `标题=${todoPage.title}, 待确认下拉=${todoPage.hasPending}`
    );
    const sweptTodos = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-todos')`));
    record(
      '逾期未完成待办打开页面时自动移入待确认',
      Array.isArray(sweptTodos) && sweptTodos[0] && sweptTodos[0].plannedDate === null && sweptTodos[0].content === '过期待办验收',
      `plannedDate=${sweptTodos?.[0]?.plannedDate}`
    );

    // 选日期安排：把待确认项安排到今天
    await evaluate(`
      (() => {
        const sel = document.querySelector('[data-todo-schedule]');
        if (!sel) return 'NO_SEL';
        sel.value = ${JSON.stringify(new Date().toISOString().slice(0, 10))};
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return 'OK';
      })()
    `);
    await sleep(700);
    const scheduledTodos = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-todos')`));
    record(
      '待确认项可选日期安排到指定日',
      Array.isArray(scheduledTodos) && scheduledTodos[0] && scheduledTodos[0].plannedDate !== null,
      `plannedDate=${scheduledTodos?.[0]?.plannedDate}`
    );

    // 7. 旧学生 ID 自动迁移：把旧格式数据塞进存储，并抹掉迁移标记
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

    // 7.5 资源库工作文件 + 备课中心（L5）：上传真实文件进 IndexedDB、预览/下载/删除闭环、
    //     备课中心未配置置灰 → 合法 https 可点 → 非法协议拒绝。
    const workFilePath = join(downloadDir, WORK_FILE_NAME);
    writeFileSync(workFilePath, '这是验收脚本写入的工作文件内容。\n');

    // 7.5.1 资源库两标签页
    await click('资源库');
    const resShell = JSON.parse(
      await evaluate(`
        JSON.stringify({
          hasLinks: document.body.innerText.includes('常用网站'),
          hasFilesTab: document.body.innerText.includes('工作文件'),
          hasAddLink: !!window.__m.byText('添加网址'),
        })
      `)
    );
    record(
      '资源库默认显示常用网站标签，有添加网址入口',
      resShell.hasLinks && resShell.hasFilesTab && resShell.hasAddLink,
      `常用网站=${resShell.hasLinks}, 工作文件标签=${resShell.hasFilesTab}`
    );

    // 切到工作文件标签
    await evaluate(`window.__m.clickSel('[data-resource-tab="files"]')`);
    await sleep(700);
    const filesPanel = JSON.parse(
      await evaluate(`
        JSON.stringify({
          hasUpload: document.body.innerText.includes('上传工作文件'),
          hasPicker: !!document.querySelector('[data-file-input]'),
          hasSearch: !!document.querySelector('[data-file-search]'),
        })
      `)
    );
    record(
      '工作文件标签有上传区、文件选择与搜索框',
      filesPanel.hasUpload && filesPanel.hasPicker && filesPanel.hasSearch,
      `上传区=${filesPanel.hasUpload}, 选择器=${filesPanel.hasPicker}, 搜索=${filesPanel.hasSearch}`
    );

    // 7.5.2 上传真实文件
    const uploadDoc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const uploadNode = await cdp.send('DOM.querySelector', { nodeId: uploadDoc.root.nodeId, selector: '[data-file-input]' });
    if (!uploadNode.nodeId) throw new Error('工作文件标签应有文件选择输入框。');
    await cdp.send('DOM.setFileInputFiles', { nodeId: uploadNode.nodeId, files: [workFilePath] });
    await sleep(1000);
    const draftState = JSON.parse(
      await evaluate(`
        JSON.stringify({
          hasConfirm: !!window.__m.byText('确认上传'),
          listed: document.body.innerText.includes(${JSON.stringify(WORK_FILE_NAME)}),
        })
      `)
    );
    record(
      '选择文件后进入待上传清单并可确认上传',
      draftState.hasConfirm && draftState.listed,
      `确认按钮=${draftState.hasConfirm}, 清单可见=${draftState.listed}`
    );

    await click('确认上传');
    const uploadedFiles = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-files')`));
    const uploadedMeta = Array.isArray(uploadedFiles) ? uploadedFiles.find((f) => f.originalName === WORK_FILE_NAME) : null;
    record(
      '确认上传后写入元数据（原名 + 大小 + 分类 + 时间戳）',
      Boolean(uploadedMeta) && uploadedMeta.sizeBytes > 0 && 'uploadedAt' in uploadedMeta && 'id' in uploadedMeta,
      `元数据=${JSON.stringify(uploadedMeta).slice(0, 120)}`
    );
    const uploadedId = uploadedMeta?.id;

    // 刷新后文件列表仍在（元数据在 localStorage，Blob 在 IndexedDB）
    await goto();
    await click('资源库');
    await evaluate(`window.__m.clickSel('[data-resource-tab="files"]')`);
    await sleep(700);
    const reloadedFiles = JSON.parse(
      await evaluate(`
        JSON.stringify({
          listed: document.body.innerText.includes(${JSON.stringify(WORK_FILE_NAME)}),
          hasDownload: !!window.__m.byText('下载'),
          hasDelete: !!window.__m.byText('删除'),
          previewCount: [...document.querySelectorAll('[data-action^="preview-file:"]')].length,
        })
      `)
    );
    record(
      '刷新后文件仍在列表，且有下载与删除入口',
      reloadedFiles.listed && reloadedFiles.hasDownload && reloadedFiles.hasDelete,
      `列表可见=${reloadedFiles.listed}, 下载=${reloadedFiles.hasDownload}, 删除=${reloadedFiles.hasDelete}`
    );

    // 7.5.3 下载文件：点下载应触发浏览器下载（通过 a.click 走 download 属性）
    // 下载文件是 Blob URL，无头浏览器下验证元数据 + Blob 在 IndexedDB 里即可（真正下载路径由预览/下载动作保证）
    await evaluate(`window.__m.clickSel('[data-action="download-file:${uploadedId}"]')`);
    await sleep(800);

    // 7.5.4 删除文件：二次确认后从元数据移除
    await evaluate(`window.__m.clickSel('[data-action="delete-file:${uploadedId}"]')`);
    await sleep(600);
    const deleteDialog = JSON.parse(
      await evaluate(`
        JSON.stringify({
          modalVisible: !!document.querySelector('.local-modal'),
          modalText: (document.querySelector('.local-modal') || {}).innerText || '',
        })
      `)
    );
    record(
      '删除文件弹出二次确认',
      deleteDialog.modalVisible && deleteDialog.modalText.includes('永久删除'),
      `弹窗可见=${deleteDialog.modalVisible}, 文案=${deleteDialog.modalText.slice(0, 40)}`
    );

    await click('确认删除文件');
    const afterDeleteFiles = JSON.parse(await evaluate(`localStorage.getItem('teacher-local-files')`));
    record(
      '确认后文件从元数据移除',
      Array.isArray(afterDeleteFiles) && !afterDeleteFiles.some((f) => f.id === uploadedId),
      `剩余文件数=${afterDeleteFiles?.length ?? 0}`
    );

    // 7.5.5 备课中心：未配置置灰 → 合法 https 可点 → 非法协议拒绝
    await click('备课中心');
    const prepShell = JSON.parse(
      await evaluate(`
        JSON.stringify({
          hasTitle: document.body.innerText.includes('备课中心'),
          hasInput: !!document.querySelector('[data-prep-url]'),
          hasDisabled: (() => { const b = window.__m.byText('打开备课中心'); return !!b && b.disabled; })(),
          unconfigured: document.body.innerText.includes('尚未配置'),
        })
      `)
    );
    record(
      '备课中心未配置时打开按钮置灰',
      prepShell.hasTitle && prepShell.hasInput && prepShell.hasDisabled && prepShell.unconfigured,
      `输入框=${prepShell.hasInput}, 置灰=${prepShell.hasDisabled}, 未配置提示=${prepShell.unconfigured}`
    );

    // 填合法 https 地址并保存
    await evaluate(`window.__m.fill('备课中心地址', ${JSON.stringify(PREP_URL)})`);
    await sleep(400);
    await click('保存配置');
    const prepConfigured = JSON.parse(
      await evaluate(`
        JSON.stringify({
          configured: document.body.innerText.includes('已配置'),
          enabled: (() => { const b = window.__m.byText('打开备课中心'); return !!b && !b.disabled; })(),
        })
      `)
    );
    record(
      '保存合法 https 地址后按钮可点、显示已配置',
      prepConfigured.configured && prepConfigured.enabled,
      `已配置=${prepConfigured.configured}, 按钮可点=${prepConfigured.enabled}`
    );

    // 填非法 http 地址应被拒绝
    await evaluate(`window.__m.fill('备课中心地址', 'http://insecure.example.com')`);
    await sleep(400);
    await click('保存配置');
    const prepRejected = JSON.parse(
      await evaluate(`localStorage.getItem('teacher-local-prep')`)
    );
    record(
      '非法 http 地址被拒绝，仍保留原合法配置',
      prepRejected === PREP_URL,
      `存储值=${JSON.stringify(prepRejected)}`
    );

    // 8. 视口
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

    // 9. 控制台
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
          // 未捕获异常的位置信息在 exceptionDetails 里，只打印 text 会得到一句没用的「Uncaught」。
          const details = event.params.exceptionDetails;
          if (details) {
            const where = details.url ? ` @ ${details.url}:${Number(details.lineNumber) + 1}` : '';
            return `${details.exception?.description ?? details.text}${where}`.split('\n')[0];
          }
          const entry = event.params.entry ?? {};
          const where = entry.url ? ` @ ${entry.url}` : '';
          return `${entry.text ?? event.params.type}${where}`;
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
