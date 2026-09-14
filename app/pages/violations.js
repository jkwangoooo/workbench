import { LOCAL_KEYS } from '../core/constants.js';
import { fmtDate } from '../core/date.js';
import { button, empty, esc, head, panel } from '../core/dom.js';
import { read } from '../core/storage.js';

export function violationsPage() {
  const items = read(LOCAL_KEYS.violations, []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return (
    head('8班违纪记录', '只按日期、学生和具体事项记录，方便回看学生历史。', button('新增记录', 'new-violation', 'primary')) +
    panel(
      '记录列表',
      items.length
        ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>日期</th><th>学生</th><th>具体内容</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td>${fmtDate(item.date)}</td><td>${esc(item.student)}</td><td>${esc(item.text)}</td><td>${button('删除', `delete-violation:${item.id}`, 'small danger')}</td></tr>`).join('')}</tbody></table></div>`
        : empty('还没有违纪记录'),
      'local-span-12'
    )
  );
}
