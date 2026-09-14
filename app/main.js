import { LOCAL_KEYS, slots } from './core/constants.js';
import { today } from './core/date.js';
import { button, esc, toast } from './core/dom.js';
import { state } from './core/state.js';
import { read, uid, write } from './core/storage.js';
import { backupFilename, buildBackup, collectData, validateBackup } from './domain/backup.js';
import { HOMEWORK_DATE_RE, HOMEWORK_SCHEMA, normalizeHomework, planSave } from './domain/homework.js';
import { parseGroup } from './domain/group-template.js';
import { migrateStudentIds } from './domain/migrate.js';
import { parseSeating } from './domain/seating-template.js';
import { validateHttpUrl } from './domain/url.js';
import { diffDay, pendingChanges, VIOLATION_DATE_RE } from './domain/violations.js';
import { readJsonFile } from './io/read-json.js';
import { readRows } from './io/read-workbook.js';
import { classManagement } from './pages/class-management.js';
import { dashboard } from './pages/dashboard.js';
import { dataPage } from './pages/data.js';
import { dictationPage } from './pages/dictation.js';
import {
  homeworkChip,
  homeworkDate,
  homeworkFeedbackBody,
  homeworkMetaText,
  homeworkPage,
  homeworkSelectable,
  homeworkSlot,
  homeworkView
} from './pages/homework.js';
import { downloadTemplate, printLayout } from './pages/layouts.js';
import { planningPage } from './pages/planning.js';
import { prepPage } from './pages/prep.js';
import { resourcesPage } from './pages/resources.js';
import { rosterPage } from './pages/roster.js';
import { schedulePage } from './pages/schedule.js';
import { testsPage } from './pages/tests.js';
import { violationsPage, violationsDate, violationsView } from './pages/violations.js';
import { shell } from './ui/shell.js';

const root = document.querySelector('#local-app');

function render() {
  const content =
    state.page === 'dashboard'
      ? dashboard()
      : state.page === 'class-management'
        ? classManagement()
        : state.page === 'roster'
          ? rosterPage()
          : state.page === 'schedule'
            ? schedulePage()
            : state.page === 'violations'
              ? violationsPage()
              : state.page === 'homework'
                ? homeworkPage()
                : state.page === 'dictation'
                  ? dictationPage()
                  : state.page === 'tests'
                    ? testsPage()
                    : state.page === 'planning'
                      ? planningPage()
                      : state.page === 'resources'
                        ? resourcesPage()
                        : state.page === 'data'
                          ? dataPage()
                          : prepPage();
  root.innerHTML = shell(content);
}
function openModal(type, title, extra = {}) {
  state.modal = { type, title, ...extra };
  render();
}
function closeModal() {
  state.modal = null;
  state.pendingImport = null;
  state.homeworkPendingDelete = null;
  render();
}
function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}
function saveSchedule() {
  const schedules = read(LOCAL_KEYS.schedule, {});
  const overrides = read(LOCAL_KEYS.overrides, {});
  document.querySelectorAll('.local-schedule-cell').forEach((cell) => {
    const value = cell.value.trim();
    if (state.scheduleType === 'temporary') {
      const key = `${state.temporaryDate}:${slots.indexOf(cell.dataset.schedulePeriod)}`;
      overrides[key] = { ...(overrides[key] || {}), [cell.dataset.scheduleDay]: value };
    } else schedules[`${cell.dataset.scheduleType}:${cell.dataset.scheduleDay}:${cell.dataset.schedulePeriod}`] = value;
  });
  write(LOCAL_KEYS.schedule, schedules);
  write(LOCAL_KEYS.overrides, overrides);
  toast('课表已保存到本地');
}
function saveDictation() {
  const all = read(LOCAL_KEYS.dictation, []);
  const sheet = all.find((item) => item.id === state.selectedDictation);
  if (!sheet) return;
  document.querySelectorAll('.dict-target').forEach((input) => {
    sheet.targets[input.dataset.student] = input.value === '' ? '' : Number(input.value);
  });
  document.querySelectorAll('.dict-score').forEach((input) => {
    sheet.scores[`${input.dataset.student}:${input.dataset.column}`] = input.value === '' ? '' : Number(input.value);
  });
  write(LOCAL_KEYS.dictation, all);
  toast('听写成绩已保存');
  render();
}
function saveTest() {
  const all = read(LOCAL_KEYS.tests, []);
  const test = all.find((item) => item.id === state.selectedTest);
  if (!test) return;
  document.querySelectorAll('.test-score').forEach((input) => {
    test.scores[input.dataset.student] = input.value === '' ? '' : Number(input.value);
  });
  write(LOCAL_KEYS.tests, all);
  toast('测试成绩已保存');
  render();
}

function exportBackup() {
  const exportedAt = new Date().toISOString();
  const backup = buildBackup(collectData(), exportedAt);
  const filename = backupFilename(new Date(exportedAt));
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  write(LOCAL_KEYS.meta, { ...(read(LOCAL_KEYS.meta, {}) || {}), lastExportedAt: exportedAt });
  toast(`已导出 ${filename}`);
  render();
}

// 恢复后抹掉学生 ID 迁移标记并重跑一次：即使备份是迁移之前导出的，
// 里面的旧 ID 也会被就地改写成稳定 ID。
function restoreBackup() {
  const pending = state.pendingBackup;
  if (!pending?.backup) return;
  for (const [key, value] of Object.entries(pending.backup.data)) write(key, value);

  const meta = { ...(read(LOCAL_KEYS.meta, {}) || {}) };
  delete meta.studentIdSchema;
  delete meta.studentIdMigratedAt;
  write(LOCAL_KEYS.meta, { ...meta, restoredAt: new Date().toISOString() });
  migrateStudentIds();

  state.groupLayout = read(LOCAL_KEYS.groupLayout, null);
  state.seatingLayout = read(LOCAL_KEYS.seatingLayout, null);
  state.pendingBackup = null;
  toast('备份已恢复');
  render();
}

// —— 未保存守卫（违纪页与作业反馈页共用）——

// 当前页面有没有还没落盘的修改。null 表示干净，可以随便走。
function pendingLeave() {
  if (state.page === 'violations') {
    const view = violationsView();
    const count = pendingChanges(view.saved, view.texts).length;
    return count ? { count, detail: `违纪页有 ${count} 处还没保存的文字。继续编辑可以回去保存；放弃修改会丢掉这些改动。` } : null;
  }
  if (state.page === 'homework') {
    const count = homeworkView().pending.total;
    return count ? { count, detail: `作业反馈页有 ${count} 处还没保存的修改。继续编辑可以回去保存；放弃修改会丢掉这些改动。` } : null;
  }
  return null;
}

// 有未保存修改时不许悄悄离开：换成弹窗问一句，把要去的地方挂在 state 上等确认。
function offerNav(nav, title, detail) {
  state.pendingNav = nav;
  openModal('unsaved', title, { detail });
}

function blockedFromLeaving(targetPage) {
  if (targetPage === state.page) return false;
  const pending = pendingLeave();
  if (!pending) return false;
  offerNav({ kind: 'page', page: targetPage }, '有未保存的修改', pending.detail);
  return true;
}

function goToPage(page) {
  if (blockedFromLeaving(page)) return;
  state.page = page;
  render();
}

// —— 违纪页（需求 §3）：全班逐行录入、输入即置顶、整批一次保存 ——

function switchViolationDate(date) {
  state.violationsDate = date;
  state.violationsDraft = null;
  state.violationsSessionOrder = [];
  state.violationsError = null;
  render();
}

// 换日期和换页面一样要过未保存这一关，不能悄悄把文字丢了。
// 日期必须是 YYYY-MM-DD：日期框被清空或塞进别的东西时，宁可无视也不要把它当成一个日期用。
function requestViolationDate(date) {
  if (!VIOLATION_DATE_RE.test(String(date || '')) || date === violationsDate()) return render();
  const pending = pendingLeave();
  if (pending) return offerNav({ kind: 'violation-date', date }, '有未保存的违纪文字', pending.detail);
  switchViolationDate(date);
}

function applyPendingNav() {
  const nav = state.pendingNav;
  state.pendingNav = null;
  state.violationsDraft = null;
  state.violationsSessionOrder = [];
  state.violationsError = null;
  state.homeworkDraft = null;
  state.homeworkError = null;
  if (nav?.kind === 'page') state.page = nav.page;
  if (nav?.kind === 'violation-date') state.violationsDate = nav.date;
  if (nav?.kind === 'homework-date') state.homeworkDate = nav.date;
  if (nav?.kind === 'homework-class') {
    state.homeworkClass = nav.classNumber;
    state.homeworkSlot = null;
  }
  render();
}

// 置顶用 CSS order 而不是搬 DOM 节点：把带焦点的行从文档里摘出去再插回来，输入框会丢焦点、
// 光标跳回开头，正在打字的人会当场断线。改 order 只动视觉顺序，DOM 和焦点都不受影响。
function applyViolationRowOrder() {
  const list = document.querySelector('[data-violation-list]');
  if (!list) return;
  const rank = new Map(state.violationsSessionOrder.map((id, index) => [id, index]));
  for (const row of list.querySelectorAll('[data-violation-row]')) {
    const index = rank.get(row.dataset.violationRow);
    row.style.order = index === undefined ? '' : String(index - rank.size);
  }
}

function editViolation(input) {
  const { violationStudent: studentId, violationDate: date } = input.dataset;
  const view = violationsView();
  if (!state.violationsDraft || state.violationsDraft.date !== date) state.violationsDraft = { date, texts: { ...view.texts } };
  const texts = state.violationsDraft.texts;
  const wasEmpty = !String(texts[studentId] ?? '').trim();
  const value = input.value;
  texts[studentId] = value;
  state.violationsError = null;

  // 输入即置顶，但只在「从没内容变成有内容」那一刻算一次：反复判定会让行在打字过程中来回跳。
  if (wasEmpty && value.trim()) {
    const order = state.violationsSessionOrder;
    const at = order.indexOf(studentId);
    if (at >= 0) order.splice(at, 1);
    order.unshift(studentId);
    applyViolationRowOrder();
  }
  const rowEl = input.closest('[data-violation-row]');
  if (rowEl) rowEl.classList.toggle('filled', Boolean(value.trim()));

  const badge = document.querySelector('[data-violation-meta]');
  if (badge) badge.textContent = `${pendingChanges(view.saved, texts).length} 处修改未保存`;
}

// 整批一次写入：校验不过或写入失败都一个字都不落盘，页面保留未保存文字并说明原因。
function saveViolations() {
  const view = violationsView();
  const outcome = diffDay(view.records, view.date, view.texts);
  if (outcome.problems.length) {
    state.violationsError = outcome.problems;
    render();
    return;
  }
  if (!outcome.added.length && !outcome.updated.length && !outcome.removed.length) {
    state.violationsError = null;
    toast('没有需要保存的修改');
    render();
    return;
  }
  try {
    write(LOCAL_KEYS.violations, outcome.records);
  } catch (_) {
    state.violationsError = [
      {
        studentId: '',
        name: '浏览器本地存储',
        reason: '写入失败，本次改动一条都没保存（通常是存储写满了）。可以先到「数据与备份」页导出一份备份。'
      }
    ];
    render();
    return;
  }
  state.violationsError = null;
  state.violationsDraft = null;
  toast('违纪记录已保存');
  render();
}

function resetViolations() {
  const pending = pendingChanges(violationsView().saved, violationsView().texts).length;
  state.violationsDraft = null;
  state.violationsSessionOrder = [];
  state.violationsError = null;
  toast(pending ? `已放弃 ${pending} 处未保存修改` : '没有未保存的修改');
  render();
}

// —— 作业反馈页（需求 §4）：三条作业各自独立，内容 + 该条反馈一起提交 ——

// 草稿按「班级 + 日期」认，切换时对不上就重新起一份，避免把上一个日期的修改带过去。
function homeworkDraftFor(view) {
  const held = state.homeworkDraft;
  if (held && held.classNumber === view.classNumber && held.date === view.date) return held;
  const draft = { classNumber: view.classNumber, date: view.date, contents: { ...view.contents }, feedbacks: {} };
  state.homeworkDraft = draft;
  return draft;
}

// 当前选中那条作业的反馈草稿：第一次用到时从已保存记录拷一份，之后改的都是这份副本。
function homeworkFeedbackDraft(view) {
  const draft = homeworkDraftFor(view);
  if (!view.slot) return null;
  if (!draft.feedbacks[view.slot]) draft.feedbacks[view.slot] = { ...view.feedback };
  return draft.feedbacks[view.slot];
}

// 打字时只补文案和状态，不整体重渲染：作业内容框在「作业内容」面板里，
// 反馈表在另一块面板，换它的 innerHTML 不会碰到正在输入的那个框。
function refreshHomeworkUi({ feedbackPanel = false } = {}) {
  const view = homeworkView();
  if (feedbackPanel) document.querySelectorAll('[data-homework-feedback]').forEach((node) => (node.innerHTML = homeworkFeedbackBody(view)));
  document.querySelectorAll('[data-homework-chip]').forEach((node) => {
    const chip = homeworkChip(view, Number(node.dataset.homeworkChip));
    node.className = chip.className;
    node.textContent = chip.text;
  });
  document
    .querySelectorAll('[data-homework-slot-button]')
    .forEach((node) => node.classList.toggle('disabled', !homeworkSelectable(view, Number(node.dataset.homeworkSlotButton))));
  document.querySelectorAll('[data-action="save-homework"]').forEach((node) => node.classList.toggle('disabled', !view.slot));
  document.querySelectorAll('[data-homework-meta]').forEach((node) => (node.textContent = homeworkMetaText(view)));
}

function editHomeworkContent(input) {
  const view = homeworkView();
  const draft = homeworkDraftFor(view);
  draft.contents[Number(input.dataset.homeworkContent)] = input.value;
  state.homeworkError = null;
  refreshHomeworkUi({ feedbackPanel: true });
}

function editHomeworkRating(select) {
  const view = homeworkView();
  const draft = homeworkFeedbackDraft(view);
  const studentId = select.dataset.homeworkRating;
  if (!draft || !(studentId in draft)) return;
  draft[studentId] = { ...draft[studentId], rating: select.value };
  state.homeworkError = null;
  refreshHomeworkUi();
}

function editHomeworkNote(input) {
  const view = homeworkView();
  const draft = homeworkFeedbackDraft(view);
  const studentId = input.dataset.homeworkNote;
  if (!draft || !(studentId in draft)) return;
  draft[studentId] = { ...draft[studentId], note: input.value };
  state.homeworkError = null;
  refreshHomeworkUi();
}

function selectHomeworkSlot(slot) {
  const view = homeworkView();
  if (!homeworkSelectable(view, slot)) {
    toast(`第 ${slot} 条作业还是空的，先填上内容再录入反馈`);
    return;
  }
  state.homeworkSlot = state.homeworkSlot === slot ? null : slot;
  render();
}

function switchHomework({ date, classNumber }) {
  if (date) state.homeworkDate = date;
  if (classNumber) {
    state.homeworkClass = classNumber;
    state.homeworkSlot = null;
  }
  state.homeworkDraft = null;
  state.homeworkError = null;
  render();
}

// 换日期、换班级和换页面一样要过未保存这一关：草稿是按班级 + 日期存的，换了就回不来了。
function requestHomeworkDate(date) {
  if (!HOMEWORK_DATE_RE.test(String(date || '')) || date === homeworkDate()) return render();
  const pending = pendingLeave();
  if (pending) return offerNav({ kind: 'homework-date', date }, '有未保存的作业反馈', pending.detail);
  switchHomework({ date });
}

function requestHomeworkClass(classNumber) {
  if (!['7', '8'].includes(String(classNumber)) || classNumber === state.homeworkClass) return render();
  const pending = pendingLeave();
  if (pending) return offerNav({ kind: 'homework-class', classNumber }, '有未保存的作业反馈', pending.detail);
  switchHomework({ classNumber });
}

function writeHomework(tasks, feedback) {
  write(LOCAL_KEYS.homework, { version: HOMEWORK_SCHEMA, tasks, feedback });
}

// 保存选中的那一条作业域：内容 + 该条的学生反馈一起写，其他日期、其他班级、其他编号一律不碰。
// 校验不过或写入失败都一个字不落盘，页面保留未保存修改并说明原因。
function saveHomework() {
  const view = homeworkView();
  if (!view.slot) return toast('先选中第 1/2/3 条里的一条作业');
  const draft = homeworkDraftFor(view);
  const outcome = planSave(normalizeHomework(read(LOCAL_KEYS.homework, null)), {
    classNumber: view.classNumber,
    date: view.date,
    slot: view.slot,
    content: draft.contents[view.slot],
    feedback: homeworkFeedbackDraft(view),
    students: view.students
  });
  if (outcome.problems.length) {
    state.homeworkError = outcome.problems;
    render();
    return;
  }
  if (outcome.needsConfirm) {
    state.homeworkPendingDelete = { slot: outcome.needsConfirm.slot, feedbackCount: outcome.needsConfirm.feedbackCount };
    openModal('delete-homework', '清空这条作业？');
    return;
  }
  const { contentChanged, feedbackChanged, initialized } = outcome.summary;
  if (!contentChanged && !feedbackChanged && !initialized) {
    toast('没有需要保存的修改');
    render();
    return;
  }
  try {
    writeHomework(outcome.tasks, outcome.feedback);
  } catch (_) {
    state.homeworkError = [
      {
        name: '浏览器本地存储',
        reason: '写入失败，本次改动一条都没保存（通常是存储写满了）。可以先到「数据与备份」页导出一份备份。'
      }
    ];
    render();
    return;
  }
  state.homeworkDraft = null;
  state.homeworkError = null;
  if (outcome.deleted) state.homeworkSlot = null;
  toast(initialized && !contentChanged ? `第 ${view.slot} 条作业已按默认「优」写入全班反馈` : `第 ${view.slot} 条作业已保存`);
  render();
}

// 二次确认之后的级联删除：那条作业和它的全部反馈一起走，同日其他作业不受影响。
function confirmDeleteHomework() {
  const pending = state.homeworkPendingDelete;
  if (!pending) return closeModal();
  const view = homeworkView();
  const outcome = planSave(normalizeHomework(read(LOCAL_KEYS.homework, null)), {
    classNumber: view.classNumber,
    date: view.date,
    slot: pending.slot,
    content: '',
    confirm: true
  });
  try {
    writeHomework(outcome.tasks, outcome.feedback);
  } catch (_) {
    state.homeworkError = [{ name: '浏览器本地存储', reason: '写入失败，这条作业没有删掉（通常是存储写满了）。' }];
    return closeModal();
  }
  state.homeworkDraft = null;
  state.homeworkError = null;
  state.homeworkSlot = null;
  state.homeworkPendingDelete = null;
  closeModal();
  toast(`第 ${pending.slot} 条作业及其 ${pending.feedbackCount} 条反馈已删除`);
}

function resetHomework() {
  const total = homeworkView().pending.total;
  state.homeworkDraft = null;
  state.homeworkError = null;
  toast(total ? `已放弃 ${total} 处未保存修改` : '没有未保存的修改');
  render();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest(
    '[data-page],[data-action],[data-management-tab],[data-resource-tab],[data-schedule-type],[data-select-student]'
  );
  if (!target) return;
  if (target.dataset.page) {
    goToPage(target.dataset.page);
    return;
  }
  if (target.dataset.managementTab) {
    state.managementTab = target.dataset.managementTab;
    render();
    return;
  }
  if (target.dataset.resourceTab) {
    state.resourceTab = target.dataset.resourceTab;
    render();
    return;
  }
  if (target.dataset.scheduleType) {
    state.scheduleType = target.dataset.scheduleType;
    render();
    return;
  }
  if (target.dataset.selectStudent) {
    state.selectedStudent = target.dataset.selectStudent;
    render();
    return;
  }
  const action = target.dataset.action || '';
  if (action === 'close-modal' || action === 'cancel-import') return closeModal();
  if (action === 'data-info')
    return openModal('info', '本地数据说明', {
      body:
        '<div class="local-notice">此入口只使用浏览器本地存储，不读取云端配置、不调用云端接口。私有学生种子仅由本机页面加载。</div><div class="local-actions-row">' +
        button('打开数据与备份', 'open-data', 'primary') +
        button('知道了', 'close-modal') +
        '</div>'
    });
  if (action === 'open-data') {
    state.modal = null;
    goToPage('data');
    return;
  }
  if (action === 'export-backup') return exportBackup();
  if (action === 'cancel-restore') {
    state.pendingBackup = null;
    return render();
  }
  if (action === 'confirm-restore') return restoreBackup();
  if (action === 'schedule' || action === 'temporary-schedule') {
    state.page = 'schedule';
    state.scheduleType = action === 'temporary-schedule' ? 'temporary' : 'class';
    return render();
  }
  if (action === 'todos') return openModal('todos', '新增待办');
  if (action === 'new-note') return openModal('note', '记录快捷内容');
  if (action === 'violations') return goToPage('violations');
  if (action === 'save-violations') return saveViolations();
  if (action === 'reset-violations') return resetViolations();
  if (action === 'violations-today') return requestViolationDate(today);
  if (action === 'keep-editing') {
    state.pendingNav = null;
    return closeModal();
  }
  if (action === 'discard-edits') return applyPendingNav();
  if (action === 'save-homework') {
    if (target.classList.contains('disabled')) return;
    return saveHomework();
  }
  if (action === 'reset-homework') return resetHomework();
  if (action === 'homework-today') return requestHomeworkDate(today);
  if (action === 'cancel-delete-homework') {
    state.homeworkPendingDelete = null;
    return closeModal();
  }
  if (action === 'confirm-delete-homework') return confirmDeleteHomework();
  if (action.startsWith('homework-slot:')) return selectHomeworkSlot(Number(action.slice(14)));
  if (action === 'new-homework') return openModal('homework', '打开作业反馈');
  if (action === 'save-schedule') {
    if (target.classList.contains('disabled')) return;
    return saveSchedule();
  }
  if (action === 'new-dictation') return openModal('dictation', '新建听写阶段');
  if (action === 'new-dictation-column') return openModal('dictation-column', '新增听写项目');
  if (action === 'save-dictation') return saveDictation();
  if (action === 'new-test') return openModal('test', '新建单元测试');
  if (action === 'save-test') return saveTest();
  if (action === 'new-unit') return openModal('unit', '新增课程单元');
  if (action.startsWith('open-unit:')) return openUnit(action.slice(9));
  if (action === 'new-resource') return openModal('resource', '添加常用网址');
  if (action.startsWith('delete-resource:')) {
    const id = action.slice(15);
    write(
      LOCAL_KEYS.resources,
      read(LOCAL_KEYS.resources, []).filter((item) => item.id !== id)
    );
    return render();
  }
  if (action.startsWith('download-')) return downloadTemplate(action.slice(9));
  if (action.startsWith('import-')) return chooseTemplate(action.slice(7));
  if (action.startsWith('print-')) return printLayout(action.slice(6));
  if (action === 'confirm-import') {
    if (!state.pendingImport?.layout) return;
    if (state.pendingImport.kind === 'groups') {
      state.groupLayout = state.pendingImport.layout;
      write(LOCAL_KEYS.groupLayout, state.groupLayout);
    } else {
      state.seatingLayout = state.pendingImport.layout;
      write(LOCAL_KEYS.seatingLayout, state.seatingLayout);
    }
    toast('布局已确认保存');
    return closeModal();
  }
  if (action === 'submit-form') {
    const form = target.closest('form');
    if (form) form.requestSubmit();
  }
});
document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.matches('[data-roster-class]')) {
    state.rosterClass = el.value;
    render();
  } else if (el.matches('[data-homework-class]')) {
    requestHomeworkClass(el.value);
  } else if (el.matches('[data-homework-picker]')) {
    requestHomeworkDate(el.value);
  } else if (el.matches('[data-homework-rating]')) {
    editHomeworkRating(el);
  } else if (el.matches('[data-temporary-date]')) {
    state.temporaryDate = el.value;
    render();
  } else if (el.matches('[data-dictation-sheet]')) {
    state.selectedDictation = el.value;
    render();
  } else if (el.matches('[data-test-sheet]')) {
    state.selectedTest = el.value;
    render();
  } else if (el.matches('[data-violation-picker]')) {
    requestViolationDate(el.value);
  } else if (el.matches('[data-template-file]')) {
    const file = el.files[0];
    if (!file) return;
    readRows(file, (rows, fileErrors) => {
      const parsed = rows ? (state.pendingImport?.kind === 'groups' ? parseGroup(rows) : parseSeating(rows)) : { errors: fileErrors };
      state.pendingImport = { kind: state.pendingImport?.kind, ...parsed };
      render();
    });
  } else if (el.matches('[data-backup-file]')) {
    const file = el.files[0];
    if (!file) return;
    readJsonFile(file, (raw, fileErrors) => {
      const result = fileErrors ? { ok: false, errors: fileErrors } : validateBackup(raw);
      state.pendingBackup = result.ok ? { backup: result.backup, ignored: result.ignored } : { backup: null, errors: result.errors };
      render();
    });
  }
});
document.addEventListener('input', (event) => {
  const el = event.target;
  if (el.matches?.('[data-violation-student]')) editViolation(el);
  else if (el.matches?.('[data-homework-content]')) editHomeworkContent(el);
  else if (el.matches?.('[data-homework-note]')) editHomeworkNote(el);
});
document.addEventListener('submit', (event) => {
  const form = event.target;
  const values = formData(form);
  event.preventDefault();
  const type = form.dataset.form;
  if (type === 'note') {
    const items = read(LOCAL_KEYS.notes, []);
    items.push({
      id: uid('note'),
      date: values.date,
      text: values.text.trim(),
      createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    });
    write(LOCAL_KEYS.notes, items);
    closeModal();
    toast('快捷记录已保存');
  } else if (type === 'homework') {
    state.homeworkClass = values.classNumber;
    state.homeworkDate = values.date;
    state.homeworkSlot = null;
    state.homeworkDraft = null;
    state.homeworkError = null;
    state.page = 'homework';
    closeModal();
  } else if (type === 'todo') {
    const items = read(LOCAL_KEYS.todos, []);
    items.push({ id: uid('todo'), text: values.text.trim(), due: values.due, done: false });
    write(LOCAL_KEYS.todos, items);
    closeModal();
    toast('待办已保存');
  } else if (type === 'dictation') {
    const all = read(LOCAL_KEYS.dictation, []);
    const item = { id: uid('dictation'), classNumber: values.classNumber, title: values.title.trim(), columns: [], targets: {}, scores: {} };
    all.push(item);
    write(LOCAL_KEYS.dictation, all);
    state.dictationClass = values.classNumber;
    state.selectedDictation = item.id;
    closeModal();
    toast('听写阶段已创建');
  } else if (type === 'dictation-column') {
    const all = read(LOCAL_KEYS.dictation, []);
    const sheet = all.find((item) => item.id === state.selectedDictation);
    if (sheet) {
      sheet.columns.push({ id: uid('column'), date: values.date, name: values.name.trim() });
      write(LOCAL_KEYS.dictation, all);
    }
    closeModal();
    toast('听写项目已添加');
  } else if (type === 'test') {
    const all = read(LOCAL_KEYS.tests, []);
    const item = {
      id: uid('test'),
      classNumber: values.classNumber,
      title: values.title.trim(),
      fullScore: Number(values.fullScore) || 100,
      scores: {},
      references: {}
    };
    all.push(item);
    write(LOCAL_KEYS.tests, all);
    state.testClass = values.classNumber;
    state.selectedTest = item.id;
    closeModal();
    toast('测试已创建');
  } else if (type === 'unit') {
    const all = read(LOCAL_KEYS.planning, []);
    const lessons = values.lessons
      .split(/\r?\n/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text) => ({ id: uid('lesson'), text, done: false }));
    all.push({ id: uid('unit'), classNumber: state.planClass, title: values.title.trim(), lessons });
    write(LOCAL_KEYS.planning, all);
    closeModal();
    toast('课程单元已保存');
  } else if (type === 'resource') {
    const checked = validateHttpUrl(values.url);
    if (checked.error) {
      toast(checked.error);
      return;
    }
    const all = read(LOCAL_KEYS.resources, []);
    all.push({
      id: uid('resource'),
      name: values.name.trim(),
      url: checked.url,
      category: values.category.trim(),
      note: values.note.trim(),
      pinned: false
    });
    write(LOCAL_KEYS.resources, all);
    closeModal();
    toast('网址已保存');
  }
});
document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.matches('[data-todo-done]')) {
    const items = read(LOCAL_KEYS.todos, []);
    const item = items.find((entry) => entry.id === el.dataset.todoDone);
    if (item) item.done = el.checked;
    write(LOCAL_KEYS.todos, items);
    render();
  }
});
function openUnit(id) {
  const unit = read(LOCAL_KEYS.planning, []).find((item) => item.id === id);
  if (!unit) return;
  openModal('unit-detail', unit.title, {
    body: `<div class="local-list">${unit.lessons.map((lesson) => `<label class="local-todo"><input type="checkbox" data-lesson-done="${lesson.id}" data-unit="${unit.id}" ${lesson.done ? 'checked' : ''}><span>${esc(lesson.text)}</span></label>`).join('')}</div><div class="local-actions-row">${button('关闭', 'close-modal', 'primary')}</div>`
  });
}
document.addEventListener('change', (event) => {
  const el = event.target;
  if (el.matches('[data-lesson-done]')) {
    const all = read(LOCAL_KEYS.planning, []);
    const unit = all.find((item) => item.id === el.dataset.unit);
    const lesson = unit?.lessons.find((item) => item.id === el.dataset.lessonDone);
    if (lesson) lesson.done = el.checked;
    write(LOCAL_KEYS.planning, all);
  }
});
function chooseTemplate(kind) {
  state.pendingImport = { kind, layout: null, errors: [] };
  openModal('import', kind === 'groups' ? '导入分组模板' : '导入座次模板', { kind });
}

// 关标签页/刷新时也守一道：违纪页、作业反馈页有未保存修改就交给浏览器的原生确认框。
window.addEventListener('beforeunload', (event) => {
  if (!pendingLeave()) return;
  event.preventDefault();
  event.returnValue = '';
});

migrateStudentIds();
render();
