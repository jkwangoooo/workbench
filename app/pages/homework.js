import { LOCAL_KEYS, class7Name, class8Name } from '../core/constants.js';
import { fmtDate, today } from '../core/date.js';
import { attr, button, classLabel, empty, esc, head, panel } from '../core/dom.js';
import { rosterFor } from '../core/roster.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';
import {
  DEFAULT_RATING,
  HOMEWORK_RATINGS,
  HOMEWORK_SLOTS,
  buildContents,
  buildFeedback,
  feedbackCounts,
  feedbackFor,
  normalizeHomework,
  orphanFeedback,
  pendingContentChanges,
  pendingFeedbackChanges,
  ratingEntry,
  tasksFor
} from '../domain/homework.js';

export const homeworkDate = () => state.homeworkDate || today;
export const homeworkClass = () => (String(state.homeworkClass) === '7' ? '7' : '8');
export const homeworkSlot = () => (HOMEWORK_SLOTS.includes(Number(state.homeworkSlot)) ? Number(state.homeworkSlot) : null);

// 一页要用到的全部东西都从存储现算：草稿只活在 state 里，页面重渲染不靠 DOM 撑着。
export function homeworkView() {
  const classNumber = homeworkClass();
  const date = homeworkDate();
  const data = normalizeHomework(read(LOCAL_KEYS.homework, null));
  const students = rosterFor(classNumber);
  const tasksBySlot = tasksFor(data.tasks, classNumber, date);

  const held =
    state.homeworkDraft && state.homeworkDraft.classNumber === classNumber && state.homeworkDraft.date === date ? state.homeworkDraft : null;
  const contents = buildContents(tasksBySlot);
  if (held) for (const slot of HOMEWORK_SLOTS) contents[slot] = held.contents[slot] ?? contents[slot];

  const slot = homeworkSlot();
  const task = slot ? tasksBySlot.get(slot) || null : null;
  const savedFeedback = task ? feedbackFor(data.feedback, task.id) : new Map();
  const feedback = slot ? held?.feedbacks?.[slot] || buildFeedback(students, savedFeedback) : {};
  const blank = !String(contents[slot] ?? '').trim();
  const pendingContents = pendingContentChanges(tasksBySlot, contents);
  // 内容为空时这条作业正在走向删除，反馈的未保存修改没有意义，不算进来。
  const pendingStudents = slot && !blank ? pendingFeedbackChanges(students, savedFeedback, feedback) : [];

  return {
    classNumber,
    date,
    students,
    contents,
    tasksBySlot,
    counts: feedbackCounts(data.feedback),
    orphan: orphanFeedback(data.tasks, data.feedback),
    slot,
    task,
    savedFeedback,
    feedback,
    blank,
    // 选中了但内容变空、又没有已保存的作业时，反馈表没有可挂的作业，不显示。
    visible: Boolean(slot) && (Boolean(task) || !blank),
    initializing: Boolean(slot) && !blank && !savedFeedback.size,
    pending: { contents: pendingContents, students: pendingStudents, total: pendingContents.length + pendingStudents.length }
  };
}

export function homeworkMetaText(view) {
  if (view.pending.total) return `${view.pending.total} 处修改未保存`;
  if (view.initializing) return '本条还没保存过反馈';
  return '';
}

// 每条作业右上角的状态牌。改内容时只换文字和 class，不重建这一行，输入框才不会丢焦点。
export function homeworkChip(view, slot) {
  const task = view.tasksBySlot.get(slot) || null;
  const content = String(view.contents[slot] ?? '');
  const count = task ? view.counts.get(task.id) || 0 : 0;
  if (!content.trim()) {
    if (count) return { className: 'local-badge bad', text: `清空后保存会删掉这条作业（含 ${count} 条反馈）` };
    return { className: 'local-badge', text: '空白' };
  }
  if (count) return { className: 'local-badge good', text: `已有反馈 ${count} 人` };
  return { className: 'local-badge blue', text: '还没保存过反馈' };
}

export const homeworkSelectable = (view, slot) => Boolean(String(view.contents[slot] ?? '').trim() || view.tasksBySlot.get(slot));

function slotRow(view, slot) {
  const active = view.slot === slot;
  const chip = homeworkChip(view, slot);
  const label = active ? '正在录入' : '录入反馈';
  const disabled = homeworkSelectable(view, slot) ? '' : ' disabled';
  return `<div class="local-homework-slot${active ? ' active' : ''}"><span class="local-homework-slot-name">第 ${slot} 条作业</span><input class="local-input local-homework-content" type="text" value="${attr(view.contents[slot])}" data-homework-content="${slot}" placeholder="填写这份作业的内容"><span class="${chip.className}" data-homework-chip="${slot}">${esc(chip.text)}</span><button type="button" class="local-button small${active ? ' primary' : ''}${disabled}" data-action="homework-slot:${slot}" data-homework-slot-button="${slot}">${label}</button></div>`;
}

function feedbackRow(view, student) {
  const entry = ratingEntry(view.feedback[student.id]);
  const changed = view.pending.students.includes(student.id) ? ' changed' : '';
  const options = HOMEWORK_RATINGS.map((rating) => `<option${rating === entry.rating ? ' selected' : ''}>${esc(rating)}</option>`).join('');
  return `<div class="local-homework-row${changed}" data-homework-row="${attr(student.id)}"><span class="local-homework-name" title="${attr(student.name)}">${esc(student.name)}</span><select class="local-select local-homework-rating" data-homework-rating="${attr(student.id)}" aria-label="${attr(student.name)} 作业状态">${options}</select><input class="local-input local-homework-note" type="text" value="${attr(entry.note)}" data-homework-note="${attr(student.id)}" aria-label="${attr(student.name)} 备注" placeholder="备注（可以为空）"></div>`;
}

// 反馈表正文单独导出：打字时只换这一块的 innerHTML，正在输入的作业内容框在另一块面板里，
// 焦点和光标都不会动（违纪页踩过「搬 DOM 节点丢焦点」的坑）。
export function homeworkFeedbackBody(view) {
  if (!view.visible) return empty('先在「作业内容」里填好一条作业，再点这条的「录入反馈」，下面就会显示该班全体学生的反馈表。');
  const caption = `<div class="local-homework-caption">第 ${view.slot} 条作业 · ${esc(classLabel(view.classNumber))} · ${esc(fmtDate(view.date))}<span>全班 ${view.students.length} 人；没改动的学生保持「${DEFAULT_RATING}」</span></div>`;
  const banner = view.blank
    ? `<div class="local-error">第 ${view.slot} 条作业的内容现在是空的。保存不会直接删：${
        view.savedFeedback.size
          ? `这条作业已有 ${view.savedFeedback.size} 名学生的反馈，会先弹一次确认，确认后连反馈一起永久删除。`
          : '这条作业还没有反馈，保存会直接把它收掉。'
      }</div>`
    : '';
  const rows = view.students.map((student) => feedbackRow(view, student)).join('');
  return `${caption}${banner}<div class="local-homework-head"><span>学生</span><span>状态</span><span>备注</span></div><div class="local-homework-list" data-homework-list>${rows}</div>`;
}

function toolbar(view) {
  return `<div class="local-homework-bar"><div class="local-field"><label>班级</label><select class="local-select" data-homework-class><option value="8"${view.classNumber === '8' ? ' selected' : ''}>${esc(class8Name)}</option><option value="7"${view.classNumber === '7' ? ' selected' : ''}>${esc(class7Name)}</option></select></div><div class="local-field"><label>日期</label><input class="local-input" type="date" data-homework-picker value="${attr(view.date)}"></div>${button('回到今天', 'homework-today', 'small')}<span class="local-homework-tip">每天固定第 1/2/3 条，按条保存：选中第几条，就保存第几条，三条互不影响。换日期、换班级或离开页面前有没保存的修改，会先问一句。</span></div>`;
}

export function homeworkPage() {
  const view = homeworkView();
  const problems = state.homeworkError || [];
  const failed = problems.length
    ? `<div class="local-error">本次未保存任何改动：${problems.map((item) => `<div>${esc(item.name)}：${esc(item.reason)}</div>`).join('')}</div>`
    : '';
  const orphanNotice = view.orphan.length
    ? `<div class="local-notice">有 ${view.orphan.length} 条旧版本留下的作业反馈没有对应的作业内容（旧版本只存反馈、不存作业内容），已原样保留在数据里，但不在下面显示。</div>`
    : '';
  const saveDisabled = view.slot ? '' : ' disabled';

  return (
    head(
      '作业反馈',
      '7 班和 8 班，每天固定第 1、2、3 条作业，各自独立保存；每名学生默认「优」，可改成不交 / 良 / 差，备注栏始终可填。',
      `<span class="local-violation-meta" data-homework-meta>${esc(homeworkMetaText(view))}</span>${button('放弃修改', 'reset-homework')}${button('保存本条作业反馈', 'save-homework', `primary${saveDisabled}`)}`
    ) +
    panel(
      '作业内容',
      `${toolbar(view)}${failed}${orphanNotice}<div class="local-homework-slots">${HOMEWORK_SLOTS.map((slot) => slotRow(view, slot)).join('')}</div>`,
      'local-span-12'
    ) +
    panel('学生反馈', `<div data-homework-feedback>${homeworkFeedbackBody(view)}</div>`, 'local-span-12')
  );
}
