import { LOCAL_KEYS } from '../core/constants.js';
import { fmtDate, today } from '../core/date.js';
import { attr, button, empty, esc, head, panel } from '../core/dom.js';
import { read } from '../core/storage.js';
import { effectiveCourses } from './schedule.js';

export function dashboard() {
  const courses8 = effectiveCourses('class', today).filter((entry) => entry.value);
  const coursesMe = effectiveCourses('teacher', today).filter((entry) => entry.value);
  const todos = read(LOCAL_KEYS.todos, [])
    .filter((item) => !item.done)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)));
  const notes = read(LOCAL_KEYS.notes, []).slice(-5).reverse();
  return (
    head('今日看板', '本地业务总览；记录只保存在当前设备。') +
    `<div class="local-grid">
    ${panel('今日我的课程', courseList(coursesMe, '还没有填写我的课表'), 'local-span-5')}
    ${panel('今日 8 班课程', courseList(courses8, '还没有填写8班课表'), 'local-span-4')}
    ${panel('临时调课', `<div class="local-notice">按日期单独保存临时安排，常规课表不会被覆盖。</div><div class="local-actions-row">${button('打开临时调课', 'temporary-schedule', 'primary')}</div>`, 'local-span-3')}
    ${panel('待办事项', `${todos.length ? `<div class="local-todos">${todos.slice(0, 5).map(todoRow).join('')}</div>` : empty('暂时没有未完成待办')}<div class="local-actions-row">${button('新增待办', 'todos', 'small')}</div>`, 'local-span-7')}
    ${panel('快捷记录', `<div class="local-list">${button('记录一条内容', 'new-note', 'small')} ${button('记录8班事项', 'new-violation', 'small')} ${button('记录作业反馈', 'new-homework', 'small')} ${button('调整今日课表', 'schedule', 'small')}</div>`, 'local-span-5')}
    ${panel('最近快捷记录', notes.length ? `<div class="local-list">${notes.map((item) => `<div class="local-item"><span class="local-period">${fmtDate(item.date)}</span><div><strong>${esc(item.text)}</strong><small>${esc(item.createdAt || '')}</small></div></div>`).join('')}</div>` : empty('还没有快捷记录'), 'local-span-12')}
  </div>`
  );
}
export function courseList(entries, noText) {
  return entries.length
    ? `<div class="local-list">${entries
        .slice(0, 8)
        .map(
          (entry, i) =>
            `<div class="local-item ${i === 0 ? 'current' : ''}"><span class="local-period">${esc(entry.period)}</span><div><strong>${esc(entry.value)}</strong><small>${i === 0 ? '当前安排' : '常规课表'}</small></div><span class="local-dot ${i === 0 ? 'current' : ''}"></span></div>`
        )
        .join('')}</div>`
    : empty(noText);
}
export function todoRow(item) {
  return `<label class="local-todo"><input type="checkbox" data-todo-done="${attr(item.id)}" ${item.done ? 'checked' : ''}><span class="${item.due && item.due < today ? 'local-overdue' : ''}">${esc(item.text)}</span><small>${fmtDate(item.due)}</small></label>`;
}
