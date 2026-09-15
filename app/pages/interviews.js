// 面谈页面（需求 §5）
//
// 布局：班级选择 + 工作周选择 → 进度条 → 全班逐行（勾选框 + 备注）→ 保存/放弃按钮

import { LOCAL_KEYS, class7Name, class8Name } from '../core/constants.js';
import { localDateStr, today } from '../core/date.js';
import { attr, button, empty, esc, head, panel } from '../core/dom.js';
import { rosterFor } from '../core/roster.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';
import {
  interviewCount,
  interviewsFor,
  isInterviewV1,
  mondayOf,
  normalizeInterviews,
  orderStudents,
  pendingInterviewChanges,
  weekLabel
} from '../domain/interviews.js';

export const interviewClass = () => state.interviewClass || '8';

export const interviewWeekStart = () => {
  const held = state.interviewWeekStart;
  if (held && held !== mondayOf(today)) return held;
  return mondayOf(today);
};

/**
 * 计算面谈页完整视图数据。
 * 返回 { classNumber, weekStart, students, saved, drafts, ordered, doneCount, totalCount, pending, initializing }
 */
export function interviewView() {
  const classNumber = interviewClass();
  const weekStart = interviewWeekStart();
  const students = rosterFor(classNumber);
  const normalized = normalizeInterviews(read(LOCAL_KEYS.interviews, null));
  const saved = interviewsFor(normalized, classNumber, weekStart);

  // 草稿：第一次用到时从已保存记录拷贝，之后改的是副本
  const held = state.interviewDraft;
  let drafts = null;
  if (held && held.classNumber === classNumber && held.weekStart === weekStart) {
    drafts = held.drafts;
  } else {
    drafts = new Map();
    for (const s of students) {
      const rec = saved.get(s.id);
      drafts.set(s.id, { completed: rec?.completed === true, note: rec?.note || '' });
    }
  }

  const ordered = orderStudents(
    students.map((s) => s.id),
    saved,
    drafts
  );
  let draftDone = 0;
  for (const [, d] of drafts) if (d.completed) draftDone += 1;

  return {
    classNumber,
    weekStart,
    students,
    saved,
    drafts,
    ordered,
    doneCount: draftDone,
    totalCount: students.length,
    pending: pendingInterviewChanges(saved, drafts),
    initializing: !held || held.classNumber !== classNumber || held.weekStart !== weekStart
  };
}

/** 单行学生：姓名 + 勾选框 + 备注输入框 */
function row(student, draft) {
  const checked = draft.completed ? ' checked' : '';
  return (
    '<div class="local-interview-row" data-interview-row="' +
    attr(student.id) +
    '">' +
    '<span class="local-interview-name" title="' +
    attr(student.name) +
    '">' +
    esc(student.name) +
    '</span>' +
    '<label class="local-interview-check">' +
    '<input type="checkbox" data-interview-check="' +
    attr(student.id) +
    '"' +
    checked +
    '>' +
    '<span>已面谈</span></label>' +
    '<input class="local-input local-interview-note" type="text" value="' +
    attr(draft.note) +
    '" data-interview-note="' +
    attr(student.id) +
    '" placeholder="备注（可选）"' +
    ' aria-label="' +
    attr(student.name) +
    ' 面谈备注"></div>'
  );
}

/** 进度条 */
function progressBar(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    '<div class="local-interview-progress">' +
    '<span class="local-interview-progress-text">本周已面谈 <strong>' +
    done +
    '</strong> / ' +
    total +
    ' 人</span>' +
    '<div class="local-interview-progress-bar"><div class="local-interview-progress-fill" style="width:' +
    pct +
    '%"></div></div></div>'
  );
}

/** 工具栏：班级选择 + 工作周选择 + 回到本周 */
function toolbar(classNumber, weekStart) {
  const classOptions = [
    ['8', class8Name],
    ['7', class7Name]
  ];
  const currentMonday = mondayOf(today);
  const weekOptions = [];
  for (let i = -8; i <= 3; i++) {
    const m = new Date(currentMonday + 'T00:00:00');
    m.setDate(m.getDate() + i * 7);
    const ms = localDateStr(m);
    weekOptions.push([ms, weekLabel(ms)]);
  }
  return (
    '<div class="local-interview-bar">' +
    '<div class="local-field"><label>班级</label><select class="local-select" data-interview-class>' +
    classOptions
      .map(
        ([value, label]) =>
          '<option value="' + attr(value) + '"' + (String(value) === String(classNumber) ? ' selected' : '') + '>' + esc(label) + '</option>'
      )
      .join('') +
    '</select></div>' +
    '<div class="local-field"><label>工作周</label><select class="local-select" data-interview-week>' +
    weekOptions
      .map(
        ([value, label]) =>
          '<option value="' + attr(value) + '"' + (String(value) === String(weekStart) ? ' selected' : '') + '>' + esc(label) + '</option>'
      )
      .join('') +
    '</select></div>' +
    button('回到本周', 'interview-this-week', 'small') +
    '<span class="local-interview-tip">未面谈学生排在上方；取消勾选不会删除备注。</span></div>'
  );
}

export function interviewPage() {
  const view = interviewView();
  const problems = state.interviewError || [];
  const meta = view.pending ? view.pending + ' 处修改未保存' : view.initializing ? '本条还没保存过' : '';
  const failed = problems.length
    ? '<div class="local-error">本次未保存任何改动：' + problems.map((item) => esc(item.name) + '：' + esc(item.reason)).join('') + '</div>'
    : '';

  const rows = view.ordered
    .map(function (studentId) {
      var student = view.students.find(function (s) {
        return s.id === studentId;
      });
      return student ? row(student, view.drafts.get(studentId)) : '';
    })
    .join('');

  const grid = view.ordered.length
    ? progressBar(view.doneCount, view.totalCount) +
      '<div class="local-interview-head"><span>学生</span><span>状态</span><span>备注</span></div>' +
      '<div class="local-interview-list" data-interview-list">' +
      rows +
      '</div>'
    : empty('当前班级没有学生，请先检查学生数据。');

  return (
    head(
      '每周学生面谈',
      '7 班和 8 班，以工作周为维度，每周每名学生记录一次面谈状态和备注。未面谈学生排在上方。',
      '<span class="local-violation-meta" data-interview-meta>' +
        meta +
        '</span>' +
        button('放弃修改', 'reset-interviews') +
        button('保存本周面谈', 'save-interviews', 'primary')
    ) + panel('面谈记录', toolbar(view.classNumber, view.weekStart) + failed + grid, 'local-span-12')
  );
}
