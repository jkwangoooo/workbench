import { LOCAL_KEYS, slots } from './core/constants.js';
import { button, esc, toast } from './core/dom.js';
import { state } from './core/state.js';
import { read, uid, write } from './core/storage.js';
import { parseGroup } from './domain/group-template.js';
import { parseSeating } from './domain/seating-template.js';
import { validateHttpUrl } from './domain/url.js';
import { readRows } from './io/read-workbook.js';
import { classManagement } from './pages/class-management.js';
import { dashboard } from './pages/dashboard.js';
import { dictationPage } from './pages/dictation.js';
import { homeworkPage } from './pages/homework.js';
import { downloadTemplate, printLayout } from './pages/layouts.js';
import { planningPage } from './pages/planning.js';
import { prepPage } from './pages/prep.js';
import { resourcesPage } from './pages/resources.js';
import { rosterPage } from './pages/roster.js';
import { schedulePage } from './pages/schedule.js';
import { testsPage } from './pages/tests.js';
import { violationsPage } from './pages/violations.js';
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
function saveHomework() {
  const data = read(LOCAL_KEYS.homework, {});
  const key = `${state.homeworkClass}:${state.homeworkDate}`;
  data[key] = {};
  document.querySelectorAll('.homework-rating').forEach((select) => {
    const id = select.dataset.homeworkStudent;
    data[key][id] = { rating: select.value, note: document.querySelector(`[data-homework-note="${CSS.escape(id)}"]`)?.value.trim() || '' };
  });
  write(LOCAL_KEYS.homework, data);
  toast('作业反馈已保存');
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

document.addEventListener('click', (event) => {
  const target = event.target.closest(
    '[data-page],[data-action],[data-management-tab],[data-resource-tab],[data-schedule-type],[data-select-student]'
  );
  if (!target) return;
  if (target.dataset.page) {
    state.page = target.dataset.page;
    render();
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
        button('知道了', 'close-modal', 'primary') +
        '</div>'
    });
  if (action === 'schedule' || action === 'temporary-schedule') {
    state.page = 'schedule';
    state.scheduleType = action === 'temporary-schedule' ? 'temporary' : 'class';
    return render();
  }
  if (action === 'todos') return openModal('todos', '新增待办');
  if (action === 'new-note') return openModal('note', '记录快捷内容');
  if (action === 'new-violation') return openModal('violation', '新增8班违纪记录');
  if (action === 'new-homework') return openModal('homework', '打开作业反馈');
  if (action === 'save-schedule') {
    if (target.classList.contains('disabled')) return;
    return saveSchedule();
  }
  if (action === 'save-homework') return saveHomework();
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
  if (action.startsWith('delete-violation:')) {
    const id = action.slice(17);
    write(
      LOCAL_KEYS.violations,
      read(LOCAL_KEYS.violations, []).filter((item) => item.id !== id)
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
    state.homeworkClass = el.value;
    render();
  } else if (el.matches('[data-homework-date]')) {
    state.homeworkDate = el.value;
    render();
  } else if (el.matches('[data-temporary-date]')) {
    state.temporaryDate = el.value;
    render();
  } else if (el.matches('[data-dictation-sheet]')) {
    state.selectedDictation = el.value;
    render();
  } else if (el.matches('[data-test-sheet]')) {
    state.selectedTest = el.value;
    render();
  } else if (el.matches('[data-template-file]')) {
    const file = el.files[0];
    if (!file) return;
    readRows(file, (rows, fileErrors) => {
      const parsed = rows ? (state.pendingImport?.kind === 'groups' ? parseGroup(rows) : parseSeating(rows)) : { errors: fileErrors };
      state.pendingImport = { kind: state.pendingImport?.kind, ...parsed };
      render();
    });
  }
});
document.addEventListener('input', (event) => {
  const el = event.target;
  if (el.matches('.local-schedule-cell')) return;
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
  } else if (type === 'violation') {
    const items = read(LOCAL_KEYS.violations, []);
    items.push({ id: uid('violation'), date: values.date, student: values.student, text: values.text.trim() });
    write(LOCAL_KEYS.violations, items);
    closeModal();
    toast('违纪记录已保存');
  } else if (type === 'homework') {
    state.homeworkClass = values.classNumber;
    state.homeworkDate = values.date;
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

render();
