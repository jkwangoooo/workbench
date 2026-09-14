import { LOCAL_KEYS, class7Name, class8Name } from '../core/constants.js';
import { attr, button, empty, esc, head, panel, selectField } from '../core/dom.js';
import { rosterFor } from '../core/roster.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';
import { rankFor } from '../domain/ranking.js';

export function testsPage() {
  const tests = read(LOCAL_KEYS.tests, []).filter((item) => item.classNumber === state.testClass);
  const active = tests.find((item) => item.id === state.selectedTest) || tests[0];
  const selector = `<select class="local-select" data-test-sheet>${tests.map((item) => `<option value="${item.id}"${active && active.id === item.id ? ' selected' : ''}>${esc(item.title)}</option>`).join('')}</select>`;
  const rows = active
    ? rosterFor(state.testClass)
        .map(
          (student) =>
            `<tr><td>${esc(student.name)}</td><td><input class="local-input test-score" type="number" min="0" max="${active.fullScore}" data-student="${student.id}" value="${attr(active.scores[student.id] ?? '')}"></td><td>${rankFor(active, student.id)}</td><td>${active.references?.[student.id] ? `${active.references[student.id]} → ${rankFor(active, student.id)}` : '—'}</td></tr>`
        )
        .join('')
    : '';
  return (
    head(
      '单元测试',
      '每次测试独立建表，录入成绩后自动计算当前排名。',
      `${selectField(
        '',
        'testClass',
        [
          ['8', class8Name],
          ['7', class7Name]
        ],
        state.testClass
      ).replace(
        '<label></label>',
        ''
      )}${selector}${button('新建测试', 'new-test', 'small')}${active ? button('保存成绩', 'save-test', 'primary') : ''}${active ? button('打印', 'print-test', 'small') : ''}${active ? button('导出 CSV', 'export-test-csv', 'small') : ''}`
    ) +
    panel(
      active ? `${active.title} · 满分${active.fullScore}` : '单元测试',
      active
        ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>姓名</th><th>成绩</th><th>当前排名</th><th>历史排名对照</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : empty('还没有测试，点击“新建测试”开始。'),
      'local-span-12'
    )
  );
}
