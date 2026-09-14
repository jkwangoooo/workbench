import { LOCAL_KEYS, slots, weekdays } from '../core/constants.js';
import { currentWeekday, fmtDate } from '../core/date.js';
import { attr, button, esc, head, panel } from '../core/dom.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';

export function schedulePage() {
  const type = state.scheduleType;
  const effectiveType = type === 'temporary' ? 'class' : type;
  const selectedDay = type === 'temporary' ? currentWeekday(state.temporaryDate) : null;
  const dateTools =
    type === 'temporary'
      ? `<input class="local-input" type="date" data-temporary-date value="${attr(state.temporaryDate)}"><span class="local-muted">${selectedDay ? `只编辑${selectedDay}` : '周末不开放保存'}</span>`
      : '';
  const saveDisabled = type === 'temporary' && !selectedDay;
  const cells = slots
    .map(
      (period) =>
        `<tr><td>${esc(period)}</td>${weekdays
          .map((day) => {
            const editable = type !== 'temporary' || day === selectedDay;
            const value = scheduleValue(effectiveType, day, period, type === 'temporary' ? state.temporaryDate : null);
            return editable
              ? `<td><textarea class="local-schedule-cell" data-schedule-type="${effectiveType}" data-schedule-day="${day}" data-schedule-period="${period}" placeholder="填写${effectiveType === 'teacher' ? '班级' : '课程'}">${esc(value)}</textarea></td>`
              : '<td class="local-readonly">仅查看</td>';
          })
          .join('')}</tr>`
    )
    .join('');
  return (
    head(
      '课程表',
      '周一至周五直接填写；临时调课按日期保存，不改变常规课表。',
      `<div class="local-toolbar">${dateTools}${button('保存当前课表', 'save-schedule', `primary ${saveDisabled ? 'disabled' : ''}`)}</div>`
    ) +
    `<div class="local-tabs"><button type="button" class="${type === 'class' ? 'active' : ''}" data-schedule-type="class">8班班级课表</button><button type="button" class="${type === 'teacher' ? 'active' : ''}" data-schedule-type="teacher">我的课表</button><button type="button" class="${type === 'temporary' ? 'active' : ''}" data-schedule-type="temporary">临时调课</button></div>${panel(type === 'teacher' ? '我的课表' : type === 'temporary' ? `临时调课 · ${fmtDate(state.temporaryDate)}` : '8班班级课表', `<div class="local-schedule"><table><thead><tr><th>时段</th>${weekdays.map((day) => `<th>${day}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div>`, 'local-span-12')}`
  );
}
export function scheduleValue(type, day, period, date) {
  const schedules = read(LOCAL_KEYS.schedule, {});
  if (date) return (read(LOCAL_KEYS.overrides, {})[`${date}:${slots.indexOf(period)}`] || {})[day] || '';
  return schedules[`${type}:${day}:${period}`] || '';
}
export function effectiveCourses(type, date) {
  const day = currentWeekday(date);
  return day ? slots.map((period) => ({ period, value: scheduleValue(type, day, period, type === 'class' ? date : null) })) : [];
}
