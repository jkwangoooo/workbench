import { LOCAL_KEYS } from '../core/constants.js';
import { button, empty, esc, head, panel } from '../core/dom.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';

export function planningPage() {
  const items = read(LOCAL_KEYS.planning, []).filter((item) => item.classNumber === state.planClass);
  return (
    head('课程规划', '按单元组织课时内容，只保留内容和完成勾选。', button('新增单元', 'new-unit', 'primary')) +
    panel(
      '课程规划',
      items.length
        ? `<div class="local-list">${items.map((unit) => `<div class="local-item"><div><strong>${esc(unit.title)}</strong><small>${unit.lessons.filter((lesson) => lesson.done).length}/${unit.lessons.length} 课时完成</small></div>${button('打开', `open-unit:${unit.id}`, 'small')}</div>`).join('')}</div>`
        : empty('还没有规划内容，点击“新增单元”开始。'),
      'local-span-12'
    )
  );
}
