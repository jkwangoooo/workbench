import { LOCAL_KEYS, class7Name, class8Name } from '../core/constants.js';
import { attr, button, empty, esc, head, panel, selectField } from '../core/dom.js';
import { rosterFor } from '../core/roster.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';

export function dictationPage() {
  const all = read(LOCAL_KEYS.dictation, []);
  const sheets = all.filter((sheet) => sheet.classNumber === state.dictationClass);
  const active = sheets.find((sheet) => sheet.id === state.selectedDictation) || sheets[0];
  const selector = `<select class="local-select" data-dictation-sheet>${sheets.map((sheet) => `<option value="${sheet.id}"${active && sheet.id === active.id ? ' selected' : ''}>${esc(sheet.title)}</option>`).join('')}</select>`;
  const table = active
    ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>姓名</th><th>目标分</th>${active.columns.map((column) => `<th>${esc(column.date)} ${esc(column.name)}</th>`).join('')}<th>状态</th></tr></thead><tbody>${rosterFor(
        state.dictationClass
      )
        .map((student) => {
          const target = active.targets[student.id] ?? '';
          const scores = active.columns.map((column) => active.scores[`${student.id}:${column.id}`] ?? '');
          const completed = scores.filter((score) => score !== '').every((score) => Number(score) >= Number(target || 0));
          const status =
            scores.length && scores.every((score) => score !== '')
              ? completed
                ? '<span class="local-badge good">达成</span>'
                : '<span class="local-badge bad">未达成</span>'
              : '<span class="local-badge blue">进行中</span>';
          return `<tr><td>${esc(student.name)}</td><td><input class="local-input dict-target" data-student="${student.id}" value="${attr(target)}" type="number" min="0" max="100"></td>${active.columns.map((column, index) => `<td><input class="local-input dict-score" data-student="${student.id}" data-column="${column.id}" value="${attr(scores[index])}" type="number" min="0" max="100"></td>`).join('')}<td>${status}</td></tr>`;
        })
        .join('')}</tbody></table></div>`
    : empty('还没有听写阶段，点击“新建阶段”开始。');
  return (
    head(
      '听写成绩',
      '每个阶段独立建表，满分100；只计算达成状态，不排名。',
      `${selectField(
        '',
        'dictationClass',
        [
          ['8', class8Name],
          ['7', class7Name]
        ],
        state.dictationClass
      ).replace(
        '<label></label>',
        ''
      )}${selector}${button('新建阶段', 'new-dictation', 'small')}${active ? button('新增听写', 'new-dictation-column', 'small') : ''}${active ? button('保存本阶段', 'save-dictation', 'primary') : ''}${active ? button('打印', 'print-dictation', 'small') : ''}${active ? button('导出 CSV', 'export-dictation-csv', 'small') : ''}`
    ) + (active ? panel(active.title, table, 'local-span-12') : panel('听写阶段', table, 'local-span-12'))
  );
}
