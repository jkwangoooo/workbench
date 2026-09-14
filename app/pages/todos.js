// 每日待办页面（需求 §3）
//
// 布局：14 天窗口（今天起）+ 待确认区 + 新增待办入口。
// - 每个日期一张卡片，列出该日待办，可勾选完成/取消。
// - 待确认区列出无日期待办，每条带「安排日期」下拉，选日期即移入对应日。
// - 打开页面时幂等整理逾期项（移入待确认）。

import { today, fmtDate } from '../core/date.js';
import { attr, button, empty, esc, head, panel } from '../core/dom.js';
import { read, write } from '../core/storage.js';
import { LOCAL_KEYS } from '../core/constants.js';
import { pendingTodos, sweepOverdue, todoWindow, todosByDate } from '../domain/todos.js';

/** 页面视图数据：整理逾期（必要时写回）+ 归一化后按日期分组。 */
export function todoView() {
  const raw = read(LOCAL_KEYS.todos, []);
  const { todos, moved } = sweepOverdue(raw);
  // 逾期整理是「打开页面时」的副作用：有移动就写回，保证下次打开不重复。
  if (moved > 0) write(LOCAL_KEYS.todos, todos);
  const window = todoWindow();
  const byDate = todosByDate(todos);
  const pending = pendingTodos(todos);
  return { todos, moved, window, byDate, pending };
}

/** 单条待办行：勾选框 + 内容 + （可选）安排日期下拉。 */
function todoRow(item) {
  const checked = item.status === 'completed' ? ' checked' : '';
  const doneClass = item.status === 'completed' ? ' local-todo-done' : '';
  return (
    '<label class="local-todo' +
    doneClass +
    '">' +
    '<input type="checkbox" data-todo-done="' +
    attr(item.id) +
    '"' +
    checked +
    '>' +
    '<span>' +
    esc(item.content) +
    '</span>' +
    '</label>'
  );
}

/** 待确认区单条：勾选框 + 内容 + 安排日期下拉。 */
function pendingRow(item, window) {
  const checked = item.status === 'completed' ? ' checked' : '';
  const options = window.map((d) => '<option value="' + attr(d) + '">' + esc(fmtDate(d)) + '</option>').join('');
  return (
    '<div class="local-todo-pending">' +
    '<label class="local-todo">' +
    '<input type="checkbox" data-todo-done="' +
    attr(item.id) +
    '"' +
    checked +
    '>' +
    '<span>' +
    esc(item.content) +
    '</span>' +
    '</label>' +
    '<select class="local-select local-todo-schedule" data-todo-schedule="' +
    attr(item.id) +
    '">' +
    '<option value="">安排日期…</option>' +
    options +
    '</select>' +
    '</div>'
  );
}

/** 单日卡片：日期标题 + 该日待办列表。 */
function dayCard(dateStr, todos) {
  const weekday = fmtDate(dateStr) + (dateStr === today ? '（今天）' : '');
  const body = todos.length ? '<div class="local-todos">' + todos.map(todoRow).join('') + '</div>' : empty('这一天没有待办');
  return (
    '<section class="local-panel pad local-todo-day">' +
    '<div class="local-panel-title"><h3>' +
    esc(weekday) +
    '</h3><small>' +
    esc(todos.length) +
    ' 项</small></div>' +
    body +
    '</section>'
  );
}

/** 待确认区面板。 */
function pendingPanel(pending, window) {
  const body = pending.length
    ? '<div class="local-todos">' + pending.map((item) => pendingRow(item, window)).join('') + '</div>'
    : empty('没有待确认事项');
  return (
    '<section class="local-panel pad local-todo-pending-panel">' +
    '<div class="local-panel-title"><h3>待确认</h3><small>没有日期的事项，或逾期未完成的旧事项</small></div>' +
    body +
    '</section>'
  );
}

export function todosPage() {
  const view = todoView();
  const movedNote = view.moved ? '<div class="local-notice">已把 ' + view.moved + ' 项逾期未完成的待办移入待确认区。</div>' : '';
  const days = view.window.map((dateStr) => dayCard(dateStr, view.byDate.get(dateStr) || [])).join('');

  return (
    head(
      '每日待办',
      '今天起 14 天的待办，以及没有日期（待确认）的事项。逾期未完成的事项会在打开页面时自动移入待确认。',
      button('新增待办', 'new-todo', 'primary')
    ) +
    movedNote +
    pendingPanel(view.pending, view.window) +
    '<div class="local-todo-window">' +
    days +
    '</div>'
  );
}
