import { class7Name, class8Name } from '../core/constants.js';
import { classLabel, empty, esc, head, panel } from '../core/dom.js';
import { rosterFor } from '../core/roster.js';
import { state } from '../core/state.js';

export function rosterPage() {
  const number = state.rosterClass;
  const list = rosterFor(number);
  return (
    head(
      '姓名目录',
      '7班和8班均提供姓名目录；完整档案仅限8班。',
      `<select class="local-select" data-roster-class><option value="8"${number === '8' ? ' selected' : ''}>${class8Name}</option><option value="7"${number === '7' ? ' selected' : ''}>${class7Name}</option></select>`
    ) +
    panel(
      classLabel(number),
      list.length
        ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>序号</th><th>姓名</th>${number === '8' ? '<th>准考证号</th><th>省学籍辅号</th>' : ''}</tr></thead><tbody>${list.map((student, index) => `<tr><td>${index + 1}</td><td>${esc(student.name)}</td>${number === '8' ? `<td>${esc(student.examNumber)}</td><td>${esc(student.provincialStudentNumber)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`
        : empty('没有可显示的学生目录'),
      'local-span-12'
    )
  );
}
