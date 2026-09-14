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
let storage = new Map();
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
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  };
  globalThis.window = {
    WORKBENCH_SEED: {},
    addEventListener() {},
    open: () => ({ document: { write() {}, close() {} }, focus() {}, print() {} })
  };
}

async function bootstrap() {
  const source = await readFile(SEED_PATH, 'utf8');
  const holder = {};
  new Function('window', source)(holder);

  listeners.clear();
  storage = new Map();
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
    violationsDate: '2026-09-14',
    violationsDraft: null,
    violationsSessionOrder: [],
    violationsError: null,
    pendingNav: null,
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

// 违纪页的输入框事件：只需要 dataset、value、matches、closest 这几样。
function typeViolation(studentId, date, value) {
  const row = { classList: { toggle() {} } };
  fire('input', {
    dataset: { violationStudent: studentId, violationDate: date },
    value,
    matches: (selector) => selector === '[data-violation-student]',
    closest: (selector) => (selector === '[data-violation-row]' ? row : null)
  });
}

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

test('违纪页取代了弹窗式新增，模板下载与导入入口可用', { skip: SKIP }, async () => {
  await bootstrap();

  clickOn({ action: 'violations' });
  assert.ok(root.innerHTML.includes('8班违纪记录'), '看板的快捷记录应能跳到违纪页');
  assert.ok(root.innerHTML.includes('保存当天违纪'), '违纪页应有整批保存按钮');

  clickOn({ page: 'class-management' });
  clickOn({ managementTab: 'groups' });
  assert.ok(root.innerHTML.includes('下载模板'), '分组表标签页应有模板按钮');

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

test('违纪页把全班铺成一行一人，并预填当天已保存的文字', { skip: SKIP }, async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  // 旧形态（date / student 姓名 / text）也要能读出来
  storage.set('teacher-local-violations', JSON.stringify([{ id: 'v1', date: '2026-09-14', student: roster8[0].name, text: '课堂讲话' }]));

  clickOn({ page: 'violations' });
  const boxes = root.innerHTML.match(/data-violation-student=/g) || [];
  assert.equal(boxes.length, roster8.length, '全班每人都该有自己的一行输入框');
  assert.ok(root.innerHTML.includes('value="课堂讲话"'), '当天已保存的文字应预填进输入框');
  assert.ok(root.innerHTML.includes(roster8[roster8.length - 1].name), '最后一个学生也要在一屏里');
  assert.ok(!root.innerHTML.includes('新增记录'), '不该再有弹窗式的新增入口');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '刚打开时没有未保存修改');
});

test('违纪页整批保存成新形态，清空并保存即删除', { skip: SKIP }, async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { today } = await import('../../app/core/date.js');
  clickOn({ page: 'violations' });

  typeViolation(roster8[0].id, today, '课堂讲话');
  // 页内重新渲染一次（草稿存在 state 里，不是靠 DOM 撑着），文字和未保存提示都该还在
  clickOn({ page: 'violations' });
  assert.ok(root.innerHTML.includes('value="课堂讲话"'), '重渲染后未保存的草稿不应丢');
  assert.ok(root.innerHTML.includes('1 处修改未保存'), '应提示有未保存修改');

  clickOn({ action: 'save-violations' });
  const stored = JSON.parse(storage.get('teacher-local-violations'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].studentId, roster8[0].id, '写进去的是稳定学生 ID');
  assert.equal(stored[0].eventDate, today);
  assert.equal(stored[0].content, '课堂讲话');
  assert.ok(stored[0].lastRecordedAt && stored[0].createdAt && stored[0].updatedAt, '新形态要带齐三个时间戳');
  assert.ok(!('student' in stored[0]) && !('text' in stored[0]), '旧的 student / text 字段不该再写进去');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '保存后不该还是未保存状态');

  typeViolation(roster8[0].id, today, '');
  clickOn({ action: 'save-violations' });
  assert.deepEqual(JSON.parse(storage.get('teacher-local-violations')), [], '清空即删除');

  clickOn({ page: 'dashboard' });
  clickOn({ page: 'violations' });
  assert.ok(!root.innerHTML.includes('value="课堂讲话"'), '删掉之后重新进来不该复活');
});

test('违纪页有未保存文字时切页面要先确认', { skip: SKIP }, async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { today } = await import('../../app/core/date.js');
  clickOn({ page: 'violations' });

  typeViolation(roster8[1].id, today, '上课说话');
  clickOn({ page: 'dashboard' });
  assert.ok(root.innerHTML.includes('有未保存的违纪文字'), '有未保存修改时切页要先问一句');
  assert.ok(root.innerHTML.includes('8班违纪记录'), '确认之前不该已经离开');

  clickOn({ action: 'keep-editing' });
  assert.ok(root.innerHTML.includes('8班违纪记录') && root.innerHTML.includes('value="上课说话"'), '继续编辑应留在原地且文字还在');

  clickOn({ page: 'dashboard' });
  clickOn({ action: 'discard-edits' });
  assert.ok(root.innerHTML.includes('今日看板'), '放弃修改后应真的离开');
  assert.equal(storage.get('teacher-local-violations'), undefined, '放弃修改不该往存储里写东西');
});
