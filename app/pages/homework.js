import { LOCAL_KEYS, class7Name, class8Name } from '../core/constants.js';
import { fmtDate } from '../core/date.js';
import { attr, button, classLabel, esc, head, panel } from '../core/dom.js';
import { rosterFor } from '../core/roster.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';

export function homeworkPage() {
  const number = state.homeworkClass;
  const data = read(LOCAL_KEYS.homework, {});
  const key = `${number}:${state.homeworkDate}`;
  const records = data[key] || {};
  const rows = rosterFor(number)
    .map(
      (student) =>
        `<tr><td>${esc(student.name)}</td><td><select class="local-select homework-rating" data-homework-student="${student.id}"><option${(records[student.id]?.rating || '优') === '优' ? ' selected' : ''}>优</option><option${records[student.id]?.rating === '良' ? ' selected' : ''}>良</option><option${records[student.id]?.rating === '差' ? ' selected' : ''}>差</option></select></td><td><input class="local-input homework-note" data-homework-note="${student.id}" value="${attr(records[student.id]?.note || '')}" placeholder="备注"></td></tr>`
    )
    .join('');
  return (
    head(
      '作业反馈',
      '7班、8班按日期分别保存；默认全体为“优”。',
      `<select class="local-select" data-homework-class><option value="8"${number === '8' ? ' selected' : ''}>${class8Name}</option><option value="7"${number === '7' ? ' selected' : ''}>${class7Name}</option></select><input class="local-input" type="date" data-homework-date value="${state.homeworkDate}">${button('保存反馈', 'save-homework', 'primary')}`
    ) +
    panel(
      `${classLabel(number)} · ${fmtDate(state.homeworkDate)}`,
      `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>姓名</th><th>评价</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      'local-span-12'
    )
  );
}
