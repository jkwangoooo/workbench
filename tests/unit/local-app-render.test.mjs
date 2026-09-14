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
    homeworkDate: '2026-09-14',
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
    violationsDate: '2026-09-14',
    violationsDraft: null,
    violationsSessionOrder: [],
    violationsError: null,
    interviewClass: '8',
    interviewWeekStart: null,
    interviewDraft: null,
    interviewError: null,
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
  assert.ok(root.innerHTML.includes('有未保存的修改'), '有未保存修改时切页要先问一句');
  assert.ok(root.innerHTML.includes('8班违纪记录'), '确认之前不该已经离开');

  clickOn({ action: 'keep-editing' });
  assert.ok(root.innerHTML.includes('8班违纪记录') && root.innerHTML.includes('value="上课说话"'), '继续编辑应留在原地且文字还在');

  clickOn({ page: 'dashboard' });
  clickOn({ action: 'discard-edits' });
  assert.ok(root.innerHTML.includes('今日看板'), '放弃修改后应真的离开');
  assert.equal(storage.get('teacher-local-violations'), undefined, '放弃修改不该往存储里写东西');
});

test('作业反馈页固定三条作业，没选之前不显示反馈表', { skip: SKIP }, async () => {
  await bootstrap();
  clickOn({ page: 'homework' });

  const boxes = root.innerHTML.match(/data-homework-content=/g) || [];
  assert.equal(boxes.length, 3, '每天固定第 1、2、3 条作业，三条内容框都在');
  assert.ok(root.innerHTML.includes('第 3 条作业'), '第三条也要固定显示');
  assert.ok(root.innerHTML.includes('录入反馈'), '每条作业都要有录入反馈的入口');
  assert.ok(!root.innerHTML.includes('data-homework-rating'), '没选中作业之前不该显示反馈表');
  assert.ok(!root.innerHTML.includes('处修改未保存'), '刚打开时没有未保存修改');
});

test('作业反馈：选中一条即显示全班默认「优」，保存写成两张表', { skip: SKIP }, async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { today } = await import('../../app/core/date.js');
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
  assert.equal(stored.tasks[0].homeworkDate, today);
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

test('作业反馈：三条互不影响，清空一条要二次确认后才删', { skip: SKIP }, async () => {
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
  assert.equal(stored.feedback.find((row) => row.homeworkId === first.id && row.studentId === roster8[0].id).rating, '差', '第 1 条的「差」不该被第 2 条覆盖');

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

test('作业反馈页有未保存修改时切页面要先确认', { skip: SKIP }, async () => {
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

test('旧版作业反馈数据不丢：认出来但不参与当前显示', { skip: SKIP }, async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  storage.set('teacher-local-homework', JSON.stringify({ '8:2026-09-14': { [roster8[0].id]: { rating: '良', note: '旧版备注' } } }));

  clickOn({ page: 'homework' });
  assert.ok(root.innerHTML.includes('旧版本留下的作业反馈'), '要如实提示有多少条历史反馈没作业内容可挂');
  assert.ok(!root.innerHTML.includes('data-homework-rating'), '孤立的旧反馈不该混进反馈表');
  assert.equal(JSON.parse(storage.get('teacher-local-homework'))['8:2026-09-14'][roster8[0].id].note, '旧版备注', '看一眼不该改动数据');
});

// ── 面谈页渲染测试 ──

function clickInterviewCheck(studentId, checked) {
  fire('change', { dataset: { interviewCheck: studentId }, checked, matches: (s) => s === '[data-interview-check]' });
}
function typeInterviewNote(studentId, value) {
  fire('input', { dataset: { interviewNote: studentId }, value, matches: (s) => s === '[data-interview-note]' });
}

test('面谈页能渲染全班列表，含勾选框与备注栏', { skip: SKIP }, async () => {
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

test('面谈页勾选+备注保存成 v1 数组，重进读回', { skip: SKIP }, async () => {
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

test('面谈页已面谈学生有 checked，未面谈没有', { skip: SKIP }, async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { today } = await import('../../app/core/date.js');
  const { INTERVIEW_SCHEMA, mondayOf, normalizeInterviews, planSaveInterview } = await import('../../app/domain/interviews.js');
  const weekStart = mondayOf(today);
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

test('面谈页取消勾选保留备注，清空备注+未勾选=删除', { skip: SKIP }, async () => {
  await bootstrap();
  const { roster8 } = await import('../../app/core/roster.js');
  const { today } = await import('../../app/core/date.js');
  const { INTERVIEW_SCHEMA, mondayOf, normalizeInterviews, planSaveInterview } = await import('../../app/domain/interviews.js');
  const weekStart = mondayOf(today);
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

test('面谈页有未保存修改时切页面要先确认', { skip: SKIP }, async () => {
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
