import { test } from 'node:test';
import assert from 'node:assert/strict';

// 渲染测试用一份固定的内联测试种子，不读 private-data/students.js。
// 这样真实名单替换后测试仍然确定通过，不受私有数据变动影响。
const TEST_SEED = {
  classes: [
    {
      name: '2025级8班',
      students: [
        {
          name: '八班示例01',
          sortOrder: 0,
          identityNumber: '示例证件号-01',
          provincialStudentNumber: '示例学籍辅号-01',
          examNumber: '示例准考证-01',
          profile: { 性别: '男', 出生日期: '2012-01-01', 联系电话: '示例电话-01', 家庭住址: '示例地址-01', 备注: '脱敏演示数据' }
        },
        {
          name: '八班示例02',
          sortOrder: 1,
          identityNumber: '示例证件号-02',
          provincialStudentNumber: '示例学籍辅号-02',
          examNumber: '示例准考证-02',
          profile: { 性别: '女' }
        },
        {
          name: '八班示例03',
          sortOrder: 2,
          identityNumber: '示例证件号-03',
          provincialStudentNumber: '示例学籍辅号-03',
          examNumber: '示例准考证-03',
          profile: { 性别: '男' }
        }
      ]
    },
    {
      name: '2025级7班',
      students: [
        { name: '七班示例01', sortOrder: 0 },
        { name: '七班示例02', sortOrder: 1 }
      ]
    }
  ]
};

// 测试不读真实时钟：固定的「今天」同时充当违纪/作业的默认日期与面谈页的起始工作周。
// 2026-09-14 是周一，mondayOf(FIXED_DATE) === FIXED_DATE，所以两个用途能共用同一个常量；
// 一旦测试用 today、种子写死日期，跨过一个 UTC 日界就会飘红（2026-09-15 早上真发生过）。
const FIXED_DATE = '2026-09-14';

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
  // URL 需要保留原生的构造器能力（prepWorkflowUrl 用 new URL 校验 https 地址），
  // 只补充下载文件时用到的 createObjectURL / revokeObjectURL 两个静态方法。
  globalThis.URL = Object.assign(URL, { createObjectURL: () => 'blob:local', revokeObjectURL() {} });
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
    homeworkDate: FIXED_DATE,
    homeworkSlot: null,
    homeworkDraft: null,
    homeworkError: null,
    homeworkPendingDelete: null,
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
    violationsDate: FIXED_DATE,
    violationsDraft: null,
    violationsSessionOrder: [],
    violationsError: null,
    violationsHistoryStudent: null,
    violationsFilter: '',
    interviewClass: '8',
    interviewWeekStart: null,
    interviewDraft: null,
    interviewError: null,
    pendingNav: null,
    modal: null
  });
  delete state.managementTab;

  globalThis.window.WORKBENCH_SEED = TEST_SEED;
  root = { innerHTML: '' };
  bootCount += 1;
  await import(`../../app/main.js?boot=${bootCount}`);
}

function fire(type, target) {
  for (const handler of listeners.get(type) || []) handler({ target, preventDefault() {} });
}

const clickOn = (dataset, extra = {}) => fire('click', { closest: () => ({ dataset, classList: { contains: () => false }, ...extra }) });

// 键盘事件不走 fire：fire 会把传进去的对象当成 event.target，
// 而键盘处理要看的是 event.key，所以这里直接把事件对象递给 keydown 处理器。
const pressKey = (key) => {
  for (const handler of listeners.get('keydown') || []) handler({ key, preventDefault() {} });
};

// 违纪页「定位学生」输入框：只需要 dataset、value、selectionStart、matches 这几样。
function typeFilter(value) {
  fire('input', { dataset: {}, value, selectionStart: value.length, matches: (selector) => selector === '[data-violation-filter]' });
}

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

// 作业反馈页的控件事件：内容框与备注走 input，状态下拉走 change。
function typeHomeworkContent(slot, value) {
  fire('input', { dataset: { homeworkContent: String(slot) }, value, matches: (selector) => selector === '[data-homework-content]' });
}
function typeHomeworkNote(studentId, value) {
  fire('input', { dataset: { homeworkNote: studentId }, value, matches: (selector) => selector === '[data-homework-note]' });
}
function changeHomeworkRating(studentId, value) {
  fire('change', { dataset: { homeworkRating: studentId }, value, matches: (selector) => selector === '[data-homework-rating]' });
}

const PAGES = [
  ['dashboard', '今日看板'],
  ['todos', '每日待办'],
  ['class-management', '8班班级管理'],
  ['roster', '姓名目录'],
  ['schedule', '课程表'],
  ['violations', '违纪记录'],
  ['homework', '作业反馈'],
  ['interviews', '学生面谈'],
  ['dictation', '听写成绩'],
  ['tests', '单元测试'],
  ['planning', '课程规划'],
  ['resources', '资源库'],
  ['prep', '备课中心'],
  ['data', '数据与备份']
];

test('本地版每个页面都能渲染', async () => {
  await bootstrap();
  assert.ok(root.innerHTML.includes('班主任工作台'), '应渲染工作台外壳');
  for (const [page, title] of PAGES) {
    clickOn({ page });
    assert.ok(root.innerHTML.includes(title), `页面 ${page} 应渲染出「${title}」`);
  }
});

test('花名册读到种子数据且两班不串台', async () => {
  await bootstrap();
  clickOn({ page: 'roster' });
  assert.ok(root.innerHTML.includes('八班示例01'), '8班目录应有第一名学生');
  assert.ok(!root.innerHTML.includes('七班示例01'), '8班目录不应出现7班学生');

  fire('change', { matches: (s) => s === '[data-roster-class]', value: '7' });
  assert.ok(root.innerHTML.includes('七班示例01'), '切到7班后应显示7班学生');
  assert.ok(!root.innerHTML.includes('八班示例01'), '7班目录不应出现8班学生');
});

test('8班学生档案按需显示且四列齐全', async () => {
  await bootstrap();
  clickOn({ managementTab: 'profile' });
  clickOn({ page: 'class-management' });
  assert.ok(root.innerHTML.includes('八班示例01'), '档案页应列出8班学生');
  assert.ok(root.innerHTML.includes('家庭住址'), '档案页应展开该学生的档案字段');

  clickOn({ managementTab: 'roster' });
  assert.ok(root.innerHTML.includes('示例准考证-01'), '花名册应显示准考证号');
  assert.ok(root.innerHTML.includes('示例学籍辅号-01'), '花名册应显示省学籍辅号');
});

test('违纪页取代了弹窗式新增，模板下载与导入入口可用', async () => {
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

test('看板聚合待办与快捷记录', async () => {
  await bootstrap();
  assert.ok(root.innerHTML.includes('今日我的课程'), '看板应有我的课程面板');
  assert.ok(root.innerHTML.includes('今日 8 班课程'), '看板应有8班课程面板');
  assert.ok(root.innerHTML.includes('待办事项'), '看板应有待办面板');
  assert.ok(root.innerHTML.includes('快捷记录'), '看板应有快捷记录面板');
});

test('数据与备份页能导出一份备份文件', async () => {
  await bootstrap();
  clickOn({ page: 'data' });
  assert.ok(root.innerHTML.includes('备份状态'), '应有备份状态面板');
  assert.ok(root.innerHTML.includes('数据概览'), '应有数据概览面板');
  assert.ok(root.innerHTML.includes('恢复备份'), '应有恢复备份面板');
  assert.ok(root.innerHTML.includes('还没有导出过备份'), '未导出时应如实提示');

  lastDownload = null;
  clickOn({ action: 'export-backup' });
  // exportBackup 是异步的（先收集 IndexedDB 文件），等一个微任务 tick 再断言下载
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.match(lastDownload || '', /^workbench-backup-\d{8}-\d{4}\.json$/, '应下载带日期的备份文件');
});

test('本地数据说明弹窗可以跳到数据与备份页', async () => {
  await bootstrap();
  clickOn({ action: 'data-info' });
  assert.ok(root.innerHTML.includes('本地数据说明'), '应打开说明弹窗');

  clickOn({ action: 'open-data' });
  assert.ok(root.innerHTML.includes('数据概览'), '应跳到数据与备份页');
  // 「本地数据说明」也是顶栏常驻按钮的文案，不能用它判断弹窗是否关闭，
  // 这里改用只存在于该弹窗正文里的句子。
  assert.ok(!root.innerHTML.includes('此入口只使用浏览器本地存储'), '跳转后弹窗应关闭');
});

test('违纪页把全班铺成一行一人，并预填当天已保存的文字', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  // 旧形态（date / student 姓名 / text）也要能读出来
  storage.set('teacher-local-violations', JSON.stringify([{ id: 'v1', date: FIXED_DATE, student: roster8[0].name, text: '课堂讲话' }]));

  clickOn({ page: 'violations' });
  const boxes = root.innerHTML.match(/data-violation-student=/g) || [];
  assert.equal(boxes.length, roster8.length, '全班每人都该有自己的一行输入框');
  assert.ok(root.innerHTML.includes('value="课堂讲话"'), '当天已保存的文字应预填进输入框');
  assert.ok(root.innerHTML.includes(roster8[roster8.length - 1].name), '最后一个学生也要在一屏里');
  assert.ok(!root.innerHTML.includes('新增记录'), '不该再有弹窗式的新增入口');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '刚打开时没有未保存修改');
});

test('违纪页整批保存成新形态，清空并保存即删除', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  clickOn({ page: 'violations' });

  typeViolation(roster8[0].id, FIXED_DATE, '课堂讲话');
  // 页内重新渲染一次（草稿存在 state 里，不是靠 DOM 撑着），文字和未保存提示都该还在
  clickOn({ page: 'violations' });
  assert.ok(root.innerHTML.includes('value="课堂讲话"'), '重渲染后未保存的草稿不应丢');
  assert.ok(root.innerHTML.includes('1 处修改未保存'), '应提示有未保存修改');

  clickOn({ action: 'save-violations' });
  const stored = JSON.parse(storage.get('teacher-local-violations'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].studentId, roster8[0].id, '写进去的是稳定学生 ID');
  assert.equal(stored[0].eventDate, FIXED_DATE);
  assert.equal(stored[0].content, '课堂讲话');
  assert.ok(stored[0].lastRecordedAt && stored[0].createdAt && stored[0].updatedAt, '新形态要带齐三个时间戳');
  assert.ok(!('student' in stored[0]) && !('text' in stored[0]), '旧的 student / text 字段不该再写进去');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '保存后不该还是未保存状态');

  typeViolation(roster8[0].id, FIXED_DATE, '');
  clickOn({ action: 'save-violations' });
  assert.deepEqual(JSON.parse(storage.get('teacher-local-violations')), [], '清空即删除');

  clickOn({ page: 'dashboard' });
  clickOn({ page: 'violations' });
  assert.ok(!root.innerHTML.includes('value="课堂讲话"'), '删掉之后重新进来不该复活');
});

test('违纪页有未保存文字时切页面要先确认', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  clickOn({ page: 'violations' });

  typeViolation(roster8[1].id, FIXED_DATE, '上课说话');
  clickOn({ page: 'dashboard' });
  assert.ok(root.innerHTML.includes('有未保存的修改'), '有未保存修改时切页要先问一句');
  assert.ok(root.innerHTML.includes('8班违纪记录'), '确认之前不该已经离开');

  clickOn({ action: 'keep-editing' });
  assert.ok(root.innerHTML.includes('8班违纪记录') && root.innerHTML.includes('value="上课说话"'), '继续编辑应留在原地且文字还在');

  clickOn({ page: 'dashboard' });
  clickOn({ action: 'discard-edits' });
  assert.ok(root.innerHTML.includes('今日看板'), '放弃修改后应真的离开');
  assert.equal(storage.get('teacher-local-violations'), undefined, '放弃修改不该往存储里写东西');
});

test('违纪页点学生姓名打开个人历史抽屉，只列这个学生的记录', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { state } = await import('../../app/core/state.js');
  storage.set(
    'teacher-local-violations',
    JSON.stringify([
      { id: 'v1', studentId: roster8[0].id, eventDate: FIXED_DATE, content: '课堂讲话' },
      { id: 'v2', studentId: roster8[0].id, eventDate: '2026-09-10', content: '作业没交' },
      { id: 'v3', studentId: roster8[1].id, eventDate: '2026-09-11', content: '别人的事' }
    ])
  );

  clickOn({ page: 'violations' });
  assert.ok(!root.innerHTML.includes('local-drawer'), '刚打开时不该有抽屉');

  clickOn({ action: 'toggle-violation-history', violationHistory: roster8[0].id });
  assert.equal(state.violationsHistoryStudent, roster8[0].id, '抽屉记住看的是哪个学生');
  assert.ok(root.innerHTML.includes('local-drawer'), '点姓名应打开抽屉');
  assert.ok(root.innerHTML.includes('作业没交'), '抽屉里应列出该生其他日期的记录');
  assert.ok(root.innerHTML.includes('2026年09月10日'), '历史按日期显示');
  assert.ok(root.innerHTML.indexOf('2026年09月14日') < root.innerHTML.indexOf('2026年09月10日'), '最近的日期排在最前');
  assert.ok(!root.innerHTML.includes('别人的事'), '不该掺进其他学生的记录');
  assert.ok(root.innerHTML.includes('不做统计与排名'), '抽屉里要说清只做回顾');
  assert.ok(!root.innerHTML.includes('共'), '不做条数汇总');

  clickOn({ action: 'toggle-violation-history', violationHistory: roster8[0].id });
  assert.equal(state.violationsHistoryStudent, null, '再点同一个姓名应收起');
  assert.ok(!root.innerHTML.includes('local-drawer'));
});

test('违纪页历史抽屉可以跳到那一天，也能用 ESC 收起', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { state } = await import('../../app/core/state.js');
  storage.set('teacher-local-violations', JSON.stringify([{ id: 'v1', studentId: roster8[0].id, eventDate: '2026-09-10', content: '作业没交' }]));

  clickOn({ page: 'violations' });
  clickOn({ action: 'toggle-violation-history', violationHistory: roster8[0].id });
  assert.ok(root.innerHTML.includes('data-action="open-violation-date:2026-09-10"'), '每条历史都要能跳到那天');

  pressKey('Escape');
  assert.equal(state.violationsHistoryStudent, null, 'ESC 应收起抽屉');
  assert.ok(!root.innerHTML.includes('local-drawer'));
  assert.equal(state.violationsDate, FIXED_DATE, 'ESC 只收抽屉，不该顺手换日期');

  clickOn({ action: 'toggle-violation-history', violationHistory: roster8[0].id });
  clickOn({ action: 'open-violation-date:2026-09-10' });
  assert.equal(state.violationsDate, '2026-09-10', '应切到那一天');
  assert.equal(state.violationsHistoryStudent, null, '跳日期后抽屉应收起');
  assert.ok(root.innerHTML.includes('value="2026-09-10"'), '日期框应切到那一天');
  assert.ok(root.innerHTML.includes('value="作业没交"'), '那天的文字应预填进输入框');
});

test('历史抽屉里跳日期也走未保存守卫，不会把没保存的文字丢掉', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { state } = await import('../../app/core/state.js');
  storage.set('teacher-local-violations', JSON.stringify([{ id: 'v1', studentId: roster8[0].id, eventDate: '2026-09-10', content: '作业没交' }]));

  clickOn({ page: 'violations' });
  typeViolation(roster8[1].id, FIXED_DATE, '还没保存的话');
  clickOn({ action: 'toggle-violation-history', violationHistory: roster8[0].id });
  clickOn({ action: 'open-violation-date:2026-09-10' });

  assert.ok(root.innerHTML.includes('有未保存的违纪文字'), '有未保存文字时应先问一句');
  assert.equal(state.violationsDate, FIXED_DATE, '确认之前不该换日期');
  assert.ok(root.innerHTML.includes('value="还没保存的话"'), '未保存的文字要还在');
});

test('违纪页定位框把名单收敛，但保存仍然是全班', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { state } = await import('../../app/core/state.js');
  const rowCount = () => (root.innerHTML.match(/data-violation-student=/g) || []).length;

  clickOn({ page: 'violations' });
  assert.equal(rowCount(), roster8.length, '不打字时铺全班');
  assert.ok(root.innerHTML.includes('>序号<'), '表头要有序号列');
  assert.ok(root.innerHTML.includes('<span class="local-violation-index">1</span>'), '行首要有花名册序号');

  // 先让两名学生各有文字并保存
  const first = roster8[0];
  const target = roster8[1];
  typeViolation(first.id, FIXED_DATE, '甲的事');
  typeViolation(target.id, FIXED_DATE, '乙的事');
  clickOn({ action: 'save-violations' });
  assert.equal(JSON.parse(storage.get('teacher-local-violations')).length, 2);

  typeFilter(target.name);
  assert.equal(state.violationsFilter, target.name, '筛选词只放在会话状态里');
  assert.equal(rowCount(), 1, '只剩命中的那一行');
  assert.ok(root.innerHTML.includes('正在筛选'), '要有筛选状态条');
  assert.ok(root.innerHTML.includes('显示 1 人'), '要说清显示了几人');
  assert.ok(root.innerHTML.includes('保存仍然是全班'), '要说清保存范围没变');

  // 筛着一个人改文字再保存：被筛掉的那名学生一个字都不能动
  typeViolation(target.id, FIXED_DATE, '乙改过了');
  clickOn({ action: 'save-violations' });
  const stored = JSON.parse(storage.get('teacher-local-violations'));
  assert.equal(stored.length, 2, '筛选只是视图，保存仍然是全班');
  assert.equal(stored.find((item) => item.studentId === first.id).content, '甲的事', '被筛掉的学生不该受影响');
  assert.equal(stored.find((item) => item.studentId === target.id).content, '乙改过了');

  clickOn({ action: 'clear-violation-filter' });
  assert.equal(state.violationsFilter, '', '清空筛选');
  assert.equal(rowCount(), roster8.length, '回到全班');
});

test('ESC 先关抽屉，抽屉关着才清筛选', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { state } = await import('../../app/core/state.js');
  const rowCount = () => (root.innerHTML.match(/data-violation-student=/g) || []).length;

  clickOn({ page: 'violations' });
  typeFilter(roster8[1].name);
  assert.equal(state.violationsFilter, roster8[1].name);
  assert.equal(rowCount(), 1);

  clickOn({ action: 'toggle-violation-history', violationHistory: roster8[1].id });
  assert.ok(root.innerHTML.includes('local-drawer'), '抽屉应已打开');

  pressKey('Escape');
  assert.equal(state.violationsHistoryStudent, null, 'ESC 先关抽屉');
  assert.equal(state.violationsFilter, roster8[1].name, '关抽屉时不该顺手把筛选也清掉');
  assert.equal(rowCount(), 1, '筛选还在');

  pressKey('Escape');
  assert.equal(state.violationsFilter, '', '抽屉没开了，ESC 才清筛选');
  assert.equal(rowCount(), roster8.length, '回到全班');
});

test('作业反馈页固定三条作业，没选之前不显示反馈表', async () => {
  await bootstrap();
  clickOn({ page: 'homework' });

  const boxes = root.innerHTML.match(/data-homework-content=/g) || [];
  assert.equal(boxes.length, 3, '每天固定第 1、2、3 条作业，三条内容框都在');
  assert.ok(root.innerHTML.includes('第 3 条作业'), '第三条也要固定显示');
  assert.ok(root.innerHTML.includes('录入反馈'), '每条作业都要有录入反馈的入口');
  assert.ok(!root.innerHTML.includes('data-homework-rating'), '没选中作业之前不该显示反馈表');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '刚打开时没有未保存修改');
});

test('作业反馈：选中一条即显示全班默认「优」，保存写成两张表', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  clickOn({ page: 'homework' });

  // 空作业点「录入反馈」不该进得去（需求 §4.1：空白作业不允许进入反馈表）
  clickOn({ action: 'homework-slot:1' });
  assert.ok(!root.innerHTML.includes('data-homework-rating'), '空白作业不允许进入反馈表');

  typeHomeworkContent(1, '第一课词语抄写');
  clickOn({ action: 'homework-slot:1' });
  const ratings = root.innerHTML.match(/data-homework-rating=/g) || [];
  assert.equal(ratings.length, roster8.length, '选中后显示该班全体学生的反馈表');
  assert.ok(root.innerHTML.includes('备注'), '备注栏始终存在');
  assert.equal((root.innerHTML.match(/<option selected>优<\/option>/g) || []).length, roster8.length, '每名学生默认「优」');
  assert.ok(root.innerHTML.includes('1 处修改未保存'), '填了内容就该提示未保存');

  changeHomeworkRating(roster8[1].id, '不交');
  typeHomeworkNote(roster8[1].id, '没带作业本');
  // 打字时页面只做局部补丁，DOM 桩里看不到；整体重渲染一次才读得到未保存提示。
  clickOn({ page: 'homework' });
  assert.ok(root.innerHTML.includes('2 处修改未保存'), '内容 1 处 + 反馈 1 人 = 2 处');
  assert.ok(root.innerHTML.includes('<option selected>不交</option>'), '改过的状态在重渲染后仍在');

  clickOn({ action: 'save-homework' });
  const stored = JSON.parse(storage.get('teacher-local-homework'));
  assert.equal(stored.version, 2);
  assert.equal(stored.tasks.length, 1);
  assert.equal(stored.tasks[0].slot, 1);
  assert.equal(stored.tasks[0].classNumber, '8');
  assert.equal(stored.tasks[0].homeworkDate, FIXED_DATE);
  assert.equal(stored.tasks[0].content, '第一课词语抄写');
  assert.ok(stored.tasks[0].id && stored.tasks[0].createdAt && stored.tasks[0].updatedAt, '作业要带齐 id 和两个时间戳');
  assert.equal(stored.feedback.length, roster8.length, '第一次保存把全班按默认「优」写进反馈表');
  const one = stored.feedback.find((row) => row.studentId === roster8[1].id);
  assert.equal(one.rating, '不交');
  assert.equal(one.note, '没带作业本');
  assert.equal(one.homeworkId, stored.tasks[0].id, '反馈挂在作业上，不靠日期猜');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '保存后不该还是未保存状态');

  // 换页面重新进来：选中状态还在，表格读回已有记录，不重新初始化
  clickOn({ page: 'dashboard' });
  clickOn({ page: 'homework' });
  assert.ok(root.innerHTML.includes('value="第一课词语抄写"'), '内容要读回来');
  assert.ok(root.innerHTML.includes('value="没带作业本"'), '备注要读回来');
  assert.ok(root.innerHTML.includes('<option selected>不交</option>'), '状态要读回来');
  assert.ok(root.innerHTML.includes('已有反馈 ' + roster8.length + ' 人'), '状态牌应报出已反馈人数');
});

test('作业反馈：三条互不影响，清空一条要二次确认后才删', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  clickOn({ page: 'homework' });

  typeHomeworkContent(1, '第一课词语抄写');
  clickOn({ action: 'homework-slot:1' });
  changeHomeworkRating(roster8[0].id, '差');
  clickOn({ action: 'save-homework' });

  typeHomeworkContent(2, '第二课背诵');
  clickOn({ action: 'homework-slot:2' });
  clickOn({ action: 'save-homework' });

  let stored = JSON.parse(storage.get('teacher-local-homework'));
  assert.equal(stored.tasks.length, 2, '两条作业分别保存');
  const first = stored.tasks.find((task) => task.slot === 1);
  const second = stored.tasks.find((task) => task.slot === 2);
  assert.equal(stored.feedback.filter((row) => row.homeworkId === first.id).length, roster8.length);
  assert.equal(stored.feedback.filter((row) => row.homeworkId === second.id).length, roster8.length);
  assert.equal(
    stored.feedback.find((row) => row.homeworkId === first.id && row.studentId === roster8[0].id).rating,
    '差',
    '第 1 条的「差」不该被第 2 条覆盖'
  );

  // 清空第 1 条：先选中它（保存永远只作用于选中的那一条），再有反馈就得先问一句
  clickOn({ action: 'homework-slot:1' });
  typeHomeworkContent(1, '');
  clickOn({ action: 'save-homework' });
  assert.ok(root.innerHTML.includes('永久删除'), '清空已有反馈的作业要先二次确认');
  assert.ok(root.innerHTML.includes(String(roster8.length)), '确认框要报出将删除的反馈人数');
  clickOn({ action: 'cancel-delete-homework' });
  stored = JSON.parse(storage.get('teacher-local-homework'));
  assert.equal(stored.tasks.length, 2, '取消确认则什么都不改');
  assert.equal(stored.tasks.find((task) => task.slot === 1).content, '第一课词语抄写');

  // 再清一次并确认：删掉第 1 条及其反馈，第 2 条不受影响
  typeHomeworkContent(1, '');
  clickOn({ action: 'save-homework' });
  clickOn({ action: 'confirm-delete-homework' });
  stored = JSON.parse(storage.get('teacher-local-homework'));
  assert.equal(stored.tasks.length, 1, '第 1 条作业被删除');
  assert.equal(stored.tasks[0].slot, 2, '剩下的还是第 2 条');
  assert.equal(stored.tasks[0].content, '第二课背诵', '第 2 条内容没被动过');
  assert.equal(stored.feedback.filter((row) => row.homeworkId === first.id).length, 0, '第 1 条的反馈级联删除');
  assert.equal(stored.feedback.filter((row) => row.homeworkId === second.id).length, roster8.length, '第 2 条的反馈一条不少');
});

test('作业反馈页有未保存修改时切页面要先确认', async () => {
  await bootstrap();
  clickOn({ page: 'homework' });
  typeHomeworkContent(3, '第三课默写');

  clickOn({ page: 'dashboard' });
  assert.ok(root.innerHTML.includes('有未保存的修改'), '有未保存修改时切页要先问一句');
  assert.ok(root.innerHTML.includes('作业反馈'), '确认之前不该已经离开');

  clickOn({ action: 'keep-editing' });
  assert.ok(root.innerHTML.includes('value="第三课默写"'), '继续编辑应留在原地且内容还在');

  clickOn({ page: 'dashboard' });
  clickOn({ action: 'discard-edits' });
  assert.ok(root.innerHTML.includes('今日看板'), '放弃修改后应真的离开');
  assert.equal(storage.get('teacher-local-homework'), undefined, '放弃修改不该往存储里写东西');
});

test('旧版作业反馈数据不丢：认出来但不参与当前显示', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  storage.set('teacher-local-homework', JSON.stringify({ [`8:${FIXED_DATE}`]: { [roster8[0].id]: { rating: '良', note: '旧版备注' } } }));

  clickOn({ page: 'homework' });
  assert.ok(root.innerHTML.includes('旧版本留下的作业反馈'), '要如实提示有多少条历史反馈没作业内容可挂');
  assert.ok(!root.innerHTML.includes('data-homework-rating'), '孤立的旧反馈不该混进反馈表');
  assert.equal(JSON.parse(storage.get('teacher-local-homework'))[`8:${FIXED_DATE}`][roster8[0].id].note, '旧版备注', '看一眼不该改动数据');
});

// ── 面谈页渲染测试 ──

function clickInterviewCheck(studentId, checked) {
  fire('change', { dataset: { interviewCheck: studentId }, checked, matches: (s) => s === '[data-interview-check]' });
}
function typeInterviewNote(studentId, value) {
  fire('input', { dataset: { interviewNote: studentId }, value, matches: (s) => s === '[data-interview-note]' });
}

test('面谈页能渲染全班列表，含勾选框与备注栏', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');

  clickOn({ page: 'interviews' });
  assert.ok(root.innerHTML.includes('学生面谈'), '应渲染面谈页标题');
  assert.ok(root.innerHTML.includes('保存本周面谈'), '应有保存按钮');
  assert.ok(root.innerHTML.includes('已面谈'), '应有进度统计文字');

  const checks = root.innerHTML.match(/data-interview-check=/g) || [];
  assert.equal(checks.length, roster8.length, '全班每人都该有勾选框');
  const notes = root.innerHTML.match(/data-interview-note=/g) || [];
  assert.equal(notes.length, roster8.length, '全班每人都该有备注输入框');
});

test('面谈页勾选+备注保存成 v1 数组，重进读回', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  clickOn({ page: 'interviews' });

  clickInterviewCheck(roster8[0].id, true);
  typeInterviewNote(roster8[0].id, '表现积极');
  // 重渲染确认草稿不丢
  clickOn({ page: 'interviews' });
  assert.ok(root.innerHTML.includes('value="表现积极"'), '重渲染后备注草稿不应丢');
  assert.ok(root.innerHTML.includes('处修改未保存'), '编辑后应提示未保存');

  clickOn({ action: 'save-interviews' });
  const stored = JSON.parse(storage.get('teacher-local-interviews'));
  assert.equal(stored.version, 1, '存储形态应为 v1');
  assert.ok(stored.interviews.length >= 1, '至少有一条记录');
  const rec = stored.interviews.find((r) => r.studentId === roster8[0].id);
  assert.ok(rec, '应找到该学生的记录');
  assert.equal(rec.completed, true);
  assert.equal(rec.note, '表现积极');
  assert.ok(rec.id && rec.createdAt && rec.updatedAt, '记录应带 id 和时间戳');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '保存后不应提示未保存');

  // 重进页面读回
  clickOn({ page: 'dashboard' });
  clickOn({ page: 'interviews' });
  assert.ok(root.innerHTML.includes('value="表现积极"'), '重新进来应读回已保存的备注');
});

test('面谈页已面谈学生有 checked，未面谈没有', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { state } = await import('../../app/core/state.js');
  const { INTERVIEW_SCHEMA, mondayOf, normalizeInterviews, planSaveInterview } = await import('../../app/domain/interviews.js');
  // 把面谈页的工作周也钉在固定周一上，否则页面按真实「今天」算周一，种下去的记录读不回来
  const weekStart = mondayOf(FIXED_DATE);
  state.interviewWeekStart = weekStart;
  let data = normalizeInterviews(null);
  data = planSaveInterview(data, {
    classNumber: '8',
    weekStart,
    drafts: new Map([[roster8[0].id, { completed: true, note: 'ok' }]]),
    students: roster8,
    now: new Date().toISOString()
  });
  // planSaveInterview 返回裸数组，需包装成 v1 容器才能被 normalizeInterviews 正确读回
  storage.set('teacher-local-interviews', JSON.stringify({ version: INTERVIEW_SCHEMA, interviews: data.interviews }));

  clickOn({ page: 'interviews' });
  assert.ok(root.innerHTML.includes('data-interview-check="' + roster8[0].id + '" checked'), '已面谈学生应有 checked');
  const uncheckedPattern = 'data-interview-check="' + roster8[1].id + '"';
  const idx = root.innerHTML.indexOf(uncheckedPattern);
  assert.ok(idx > -1, '应有未面谈学生的行');
  const afterIdx = root.innerHTML.indexOf('>', idx + uncheckedPattern.length);
  const around = root.innerHTML.slice(idx, afterIdx + 20);
  assert.ok(!around.includes('checked'), '未面谈学生不应有 checked');
});

test('面谈页取消勾选保留备注，清空备注+未勾选=删除', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { state } = await import('../../app/core/state.js');
  const { INTERVIEW_SCHEMA, mondayOf, normalizeInterviews, planSaveInterview } = await import('../../app/domain/interviews.js');
  const weekStart = mondayOf(FIXED_DATE);
  state.interviewWeekStart = weekStart;
  // 预存一条已面谈记录
  let data = normalizeInterviews(null);
  data = planSaveInterview(data, {
    classNumber: '8',
    weekStart,
    drafts: new Map([[roster8[0].id, { completed: true, note: '之前聊过' }]]),
    students: roster8,
    now: new Date().toISOString()
  });
  storage.set('teacher-local-interviews', JSON.stringify({ version: INTERVIEW_SCHEMA, interviews: data.interviews }));

  clickOn({ page: 'interviews' });
  // 取消勾选但保留备注 → 保存后 completed=false, note 还在
  clickInterviewCheck(roster8[0].id, false);
  typeInterviewNote(roster8[0].id, '还要观察');
  clickOn({ action: 'save-interviews' });
  let stored = JSON.parse(storage.get('teacher-local-interviews'));
  const rec = stored.interviews.find((r) => r.studentId === roster8[0].id);
  assert.ok(rec, '取消勾选但保留备注时记录不应被删除');
  assert.equal(rec.completed, false);
  assert.equal(rec.note, '还要观察');

  // 清空备注且不勾选 → 删除
  typeInterviewNote(roster8[0].id, '');
  clickOn({ action: 'save-interviews' });
  stored = JSON.parse(storage.get('teacher-local-interviews'));
  assert.equal(stored.interviews.length, 0, '未勾选+备注空应删除记录');
});

test('面谈页有未保存修改时切页面要先确认', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  clickOn({ page: 'interviews' });

  clickInterviewCheck(roster8[2].id, true);
  clickOn({ page: 'dashboard' });
  assert.ok(root.innerHTML.includes('有未保存的修改'), '有未保存修改时切页要先问一句');
  assert.ok(root.innerHTML.includes('学生面谈'), '确认之前不该已经离开');

  clickOn({ action: 'keep-editing' });
  assert.ok(root.innerHTML.includes('学生面谈'), '继续编辑应留在原地');

  clickOn({ page: 'dashboard' });
  clickOn({ action: 'discard-edits' });
  assert.ok(root.innerHTML.includes('今日看板'), '放弃修改后应真的离开');
  assert.equal(storage.get('teacher-local-interviews'), undefined, '放弃修改不该写存储');
});

// ── 每日待办页渲染测试 ──

test('待办页渲染 14 天窗口和待确认区', async () => {
  await bootstrap();
  clickOn({ page: 'todos' });
  assert.ok(root.innerHTML.includes('每日待办'), '应渲染待办页标题');
  assert.ok(root.innerHTML.includes('待确认'), '应有待确认区');
  assert.ok(root.innerHTML.includes('新增待办'), '应有新增待办入口');
  // 14 天窗口：应有「（今天）」标记
  assert.ok(root.innerHTML.includes('（今天）'), '今天应有标记');
});

test('待办页逾期未完成自动移入待确认', async () => {
  await bootstrap();
  // 预存一条昨天的未完成待办（旧形态）
  storage.set('teacher-local-todos', JSON.stringify([{ id: 'old-1', text: '过期待办', due: '2020-01-01', done: false }]));

  clickOn({ page: 'todos' });
  // 逾期整理后应写入新形态，plannedDate 清空
  const stored = JSON.parse(storage.get('teacher-local-todos'));
  assert.equal(stored[0].plannedDate, null, '逾期项应移入待确认');
  assert.equal(stored[0].status, 'pending');
});

test('待办页新增待办并勾选完成', async () => {
  await bootstrap();
  clickOn({ page: 'todos' });

  // 通过表单提交新增（走 main.js 的 submit-form 处理）
  // 这里直接验证读写的闭环：先写入一条，再勾选
  storage.set(
    'teacher-local-todos',
    JSON.stringify([{ id: 'todo-x', content: '备课', plannedDate: null, status: 'pending', completedAt: null, createdAt: 'x', updatedAt: 'x' }])
  );
  clickOn({ page: 'todos' });
  assert.ok(root.innerHTML.includes('备课'), '待确认区应显示待办内容');

  // 勾选完成
  fire('change', { dataset: { todoDone: 'todo-x' }, checked: true, matches: (s) => s === '[data-todo-done]' });
  const stored = JSON.parse(storage.get('teacher-local-todos'));
  assert.equal(stored[0].status, 'completed', '勾选后应标记完成');
  assert.ok(stored[0].completedAt, '完成应有 completedAt');
});

test('待办页选日期安排待确认事项', async () => {
  await bootstrap();
  const { today } = await import('../../app/core/date.js');
  storage.set(
    'teacher-local-todos',
    JSON.stringify([{ id: 'todo-y', content: '安排这件事', plannedDate: null, status: 'pending', completedAt: null, createdAt: 'x', updatedAt: 'x' }])
  );
  clickOn({ page: 'todos' });
  assert.ok(root.innerHTML.includes('data-todo-schedule="todo-y"'), '待确认项应有安排日期下拉');

  // 选今天作为日期：这里必须用真实「今天」，因为下拉里只列今天起 14 天，
  // inWindow 也按同一个 today 判定；断言的是「写进去的等于选中的」，不依赖具体日期值。
  fire('change', { dataset: { todoSchedule: 'todo-y' }, value: today, matches: (s) => s === '[data-todo-schedule]' });
  const stored = JSON.parse(storage.get('teacher-local-todos'));
  assert.equal(stored[0].plannedDate, today, '安排后应写入计划日期');
});

// ── 资源库（L5）与备课中心渲染测试 ──

test('资源库两个标签页：常用网站与工作文件', async () => {
  await bootstrap();
  clickOn({ page: 'resources' });
  assert.ok(root.innerHTML.includes('常用网站'), '默认应显示常用网站标签');
  assert.ok(root.innerHTML.includes('工作文件'), '应有工作文件标签');
  assert.ok(root.innerHTML.includes('添加网址'), '应有添加网址入口');

  // 切到工作文件
  clickOn({ resourceTab: 'files' });
  assert.ok(root.innerHTML.includes('上传工作文件'), '应有上传区');
  assert.ok(root.innerHTML.includes('选择文件'), '应有文件选择入口');
  assert.ok(root.innerHTML.includes('搜索文件名'), '应有搜索框');
});

test('备课中心未配置时入口置灰', async () => {
  await bootstrap();
  clickOn({ page: 'prep' });
  assert.ok(root.innerHTML.includes('备课中心'), '应渲染备课中心页');
  assert.ok(root.innerHTML.includes('尚未配置'), '未配置时应提示');
  assert.ok(root.innerHTML.includes('data-prep-url'), '应有配置输入框');
  assert.ok(root.innerHTML.includes('disabled'), '打开按钮应置灰');
});

test('备课中心配置合法 https 后按钮可点', async () => {
  await bootstrap();
  clickOn({ page: 'prep' });
  // 直接写入配置并重渲染（storage 存的是 JSON 序列化值）
  storage.set('teacher-local-prep', JSON.stringify('https://prep.example.com'));
  clickOn({ page: 'prep' });
  assert.ok(root.innerHTML.includes('已配置'), '已配置时应提示');
  assert.ok(!root.innerHTML.includes('disabled'), '打开按钮应可点');
  assert.ok(root.innerHTML.includes('打开备课中心'), '应有打开按钮');
});

// ── L6 打印 / CSV 导出 / 数据体检渲染测试 ──

test('听写、单元测试、违纪三页都有打印与导出入口', async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  // 先 seed 一条测试和一条听写，让「打印/导出」按钮渲染出来
  storage.set(
    'teacher-local-tests',
    JSON.stringify([{ id: 't1', title: '第一单元', classNumber: '8', fullScore: 100, scores: { [roster8[0].id]: 90 }, references: {} }])
  );
  storage.set(
    'teacher-local-dictation',
    JSON.stringify([
      {
        id: 'd1',
        title: '第一单元听写',
        classNumber: '8',
        columns: [{ id: 'c1', date: '2026-09-14', name: '第一次' }],
        targets: {},
        scores: {}
      }
    ])
  );

  // 单元测试页
  clickOn({ page: 'tests' });
  assert.ok(root.innerHTML.includes('data-action="print-test"'), '单元测试页应有打印按钮');
  assert.ok(root.innerHTML.includes('data-action="export-test-csv"'), '单元测试页应有导出 CSV 按钮');

  // 听写页
  clickOn({ page: 'dictation' });
  assert.ok(root.innerHTML.includes('data-action="print-dictation"'), '听写页应有打印按钮');
  assert.ok(root.innerHTML.includes('data-action="export-dictation-csv"'), '听写页应有导出 CSV 按钮');

  // 违纪页（打印按钮无条件渲染）
  clickOn({ page: 'violations' });
  assert.ok(root.innerHTML.includes('data-action="print-violations"'), '违纪页应有打印按钮');
});

test('数据与备份页概览表带最后修改与占用列', async () => {
  await bootstrap();
  clickOn({ page: 'data' });
  assert.ok(root.innerHTML.includes('最后修改'), '概览表应有最后修改列');
  assert.ok(root.innerHTML.includes('占用'), '概览表应有占用列');
});
