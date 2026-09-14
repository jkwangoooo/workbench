import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const SEED_PATH = 'private-data/students.js';
const SKIP = await access(SEED_PATH).then(
  () => false,
  () => `${SEED_PATH} 不存在（私有种子未生成），跳过本地版渲染测试`
);

const listeners = new Map();
let root = null;
let lastDownload = null;
let bootCount = 0;

function createElement(tag) {
  return {
    tagName: tag,
    style: {},
    dataset: {},
    className: '',
    textContent: '',
    value: '',
    checked: false,
    files: [],
    href: '',
    download: '',
    classList: { add() {}, remove() {}, contains: () => false },
    setAttribute() {},
    removeAttribute() {},
    appendChild() {},
    remove() {},
    click() {
      if (this.tagName === 'a') lastDownload = this.download;
    }
  };
}

function installDom() {
  globalThis.document = {
    querySelector: (selector) => (selector === '#local-app' ? root : null),
    querySelectorAll: () => [],
    createElement,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    body: { appendChild() {} }
  };
  globalThis.CSS = { escape: (value) => value };
  globalThis.FileReader = class {};
  globalThis.Blob = class {};
  globalThis.URL = { createObjectURL: () => 'blob:local', revokeObjectURL() {} };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.window = {
    WORKBENCH_SEED: {},
    open: () => ({ document: { write() {}, close() {} }, focus() {}, print() {} })
  };
}

async function bootstrap() {
  const source = await readFile(SEED_PATH, 'utf8');
  const holder = {};
  new Function('window', source)(holder);

  listeners.clear();
  installDom();

  const { state } = await import('../../app/core/state.js');
  Object.assign(state, {
    page: 'dashboard',
    scheduleType: 'class',
    selectedStudent: null,
    rosterClass: '8',
    homeworkClass: '8',
    dictationClass: '8',
    selectedDictation: null,
    testClass: '8',
    selectedTest: null,
    planClass: '8',
    resourceTab: 'links',
    groupLayout: null,
    seatingLayout: null,
    pendingImport: null,
    pendingBackup: null,
    modal: null
  });
  delete state.managementTab;

  globalThis.window.WORKBENCH_SEED = holder.WORKBENCH_SEED;
  root = { innerHTML: '' };
  bootCount += 1;
  await import(`../../app/main.js?boot=${bootCount}`);
}

function fire(type, target) {
  for (const handler of listeners.get(type) || []) handler({ target, preventDefault() {} });
}

const clickOn = (dataset, extra = {}) => fire('click', { closest: () => ({ dataset, classList: { contains: () => false }, ...extra }) });

const PAGES = [
  ['dashboard', '今日看板'],
  ['class-management', '8班班级管理'],
  ['roster', '姓名目录'],
  ['schedule', '课程表'],
  ['violations', '违纪记录'],
  ['homework', '作业反馈'],
  ['dictation', '听写成绩'],
  ['tests', '单元测试'],
  ['planning', '课程规划'],
  ['resources', '资源库'],
  ['prep', '备课中心'],
  ['data', '数据与备份']
];

test('本地版每个页面都能渲染', { skip: SKIP }, async () => {
  await bootstrap();
  assert.ok(root.innerHTML.includes('班主任工作台'), '应渲染工作台外壳');
  for (const [page, title] of PAGES) {
    clickOn({ page });
    assert.ok(root.innerHTML.includes(title), `页面 ${page} 应渲染出「${title}」`);
  }
});

test('花名册读到种子数据且两班不串台', { skip: SKIP }, async () => {
  await bootstrap();
  clickOn({ page: 'roster' });
  assert.ok(root.innerHTML.includes('八班示例01'), '8班目录应有第一名学生');
  assert.ok(!root.innerHTML.includes('七班示例01'), '8班目录不应出现7班学生');

  fire('change', { matches: (s) => s === '[data-roster-class]', value: '7' });
  assert.ok(root.innerHTML.includes('七班示例01'), '切到7班后应显示7班学生');
  assert.ok(!root.innerHTML.includes('八班示例01'), '7班目录不应出现8班学生');
});

test('8班学生档案按需显示且四列齐全', { skip: SKIP }, async () => {
  await bootstrap();
  clickOn({ managementTab: 'profile' });
  clickOn({ page: 'class-management' });
  assert.ok(root.innerHTML.includes('八班示例01'), '档案页应列出8班学生');
  assert.ok(root.innerHTML.includes('家庭住址'), '档案页应展开该学生的档案字段');

  clickOn({ managementTab: 'roster' });
  assert.ok(root.innerHTML.includes('示例准考证-01'), '花名册应显示准考证号');
  assert.ok(root.innerHTML.includes('示例学籍辅号-01'), '花名册应显示省学籍辅号');
});

test('弹窗、模板下载与导入入口可用', { skip: SKIP }, async () => {
  await bootstrap();

  clickOn({ action: 'new-violation' });
  assert.ok(root.innerHTML.includes('新增8班违纪记录'), '违纪弹窗应打开');
  assert.ok(root.innerHTML.includes('八班示例01'), '违纪弹窗应列出8班学生');

  clickOn({ action: 'close-modal' });
  assert.ok(!root.innerHTML.includes('新增8班违纪记录'), '关闭后弹窗应消失');

  lastDownload = null;
  clickOn({ action: 'download-groups' });
  assert.equal(lastDownload, 'group-layout-v1.csv', '分组模板应可下载');
  clickOn({ action: 'download-seating' });
  assert.equal(lastDownload, 'seating-layout-v1.csv', '座次模板应可下载');

  clickOn({ action: 'import-groups' });
  assert.ok(root.innerHTML.includes('导入分组模板'), '分组导入弹窗应打开');
  assert.ok(root.innerHTML.includes('组别'), '导入弹窗应说明模板表头');
});

test('看板聚合待办与快捷记录', { skip: SKIP }, async () => {
  await bootstrap();
  assert.ok(root.innerHTML.includes('今日我的课程'), '看板应有我的课程面板');
  assert.ok(root.innerHTML.includes('今日 8 班课程'), '看板应有8班课程面板');
  assert.ok(root.innerHTML.includes('待办事项'), '看板应有待办面板');
  assert.ok(root.innerHTML.includes('快捷记录'), '看板应有快捷记录面板');
});

test('数据与备份页能导出一份备份文件', { skip: SKIP }, async () => {
  await bootstrap();
  clickOn({ page: 'data' });
  assert.ok(root.innerHTML.includes('备份状态'), '应有备份状态面板');
  assert.ok(root.innerHTML.includes('数据概览'), '应有数据概览面板');
  assert.ok(root.innerHTML.includes('恢复备份'), '应有恢复备份面板');
  assert.ok(root.innerHTML.includes('还没有导出过备份'), '未导出时应如实提示');

  lastDownload = null;
  clickOn({ action: 'export-backup' });
  assert.match(lastDownload || '', /^workbench-backup-\d{8}-\d{4}\.json$/, '应下载带日期的备份文件');
});

test('本地数据说明弹窗可以跳到数据与备份页', { skip: SKIP }, async () => {
  await bootstrap();
  clickOn({ action: 'data-info' });
  assert.ok(root.innerHTML.includes('本地数据说明'), '应打开说明弹窗');

  clickOn({ action: 'open-data' });
  assert.ok(root.innerHTML.includes('数据概览'), '应跳到数据与备份页');
  // 「本地数据说明」也是顶栏常驻按钮的文案，不能用它判断弹窗是否关闭，
  // 这里改用只存在于该弹窗正文里的句子。
  assert.ok(!root.innerHTML.includes('此入口只使用浏览器本地存储'), '跳转后弹窗应关闭');
});
