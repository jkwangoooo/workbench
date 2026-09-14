import { LOCAL_KEYS } from '../core/constants.js';
import { today } from '../core/date.js';
import { attr, button, empty, esc, head, panel } from '../core/dom.js';
import { roster8 } from '../core/roster.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';
import { buildDraft, normalizeRecords, orderStudents, pendingChanges, recordsForDate, unattachedRecords } from '../domain/violations.js';

export const violationsDate = () => state.violationsDate || today;

export function violationsView() {
  const date = violationsDate();
  const records = normalizeRecords(read(LOCAL_KEYS.violations, []));
  const saved = recordsForDate(records, date);
  const held = state.violationsDraft;
  const texts = held && held.date === date ? held.texts : buildDraft(roster8, saved);
  return {
    date,
    records,
    saved,
    texts,
    unattached: unattachedRecords(records),
    pending: pendingChanges(saved, texts),
    ordered: orderStudents(saved, state.violationsSessionOrder)
  };
}

function row(student, date, value) {
  const filled = String(value ?? '').trim() ? ' filled' : '';
  return `<div class="local-violation-row${filled}" data-violation-row="${attr(student.id)}"><span class="local-violation-name" title="${attr(student.name)}">${esc(student.name)}</span><input class="local-input local-violation-input" type="text" value="${attr(value)}" data-violation-student="${attr(student.id)}" data-violation-date="${attr(date)}" aria-label="${attr(student.name)} 违纪记录"></div>`;
}

export function violationsPage() {
  const view = violationsView();
  const problems = state.violationsError || [];
  const meta = view.pending.length ? `${view.pending.length} 处修改未保存` : '';
  const hint = view.unattached.length
    ? `<div class="local-notice">有 ${view.unattached.length} 条历史记录认不出对应学生（名单可能变过），已原样保留但不在下面显示。</div>`
    : '';
  const failed = problems.length
    ? `<div class="local-error">本次未保存任何改动：${problems.map((item) => `<div>${esc(item.name)}：${esc(item.reason)}</div>`).join('')}</div>`
    : '';
  const grid = view.ordered.length
    ? `<div class="local-violation-head"><span>学生</span><span>违纪文字</span></div><div class="local-violation-list" data-violation-list>${view.ordered.map((student) => row(student, view.date, view.texts[student.id])).join('')}</div>`
    : empty('花名册里没有 8 班学生，请先检查学生数据。');

  return (
    head(
      '8班违纪记录',
      '每名学生每天只保留一段文字；把文字清空并保存，就等于删除这条记录。只服务 2025 级 8 班。',
      `<span class="local-violation-meta" data-violation-meta>${meta}</span>${button('放弃修改', 'reset-violations')}${button('保存当天违纪', 'save-violations', 'primary')}${button('打印', 'print-violations', 'small')}`
    ) + panel('当天违纪', `${toolbar(view.date)}${failed}${hint}${grid}`, 'local-span-12')
  );
}

// 日期选择就放在名单上方一条细工具栏里，省下的纵向空间全给 50 行名单。
function toolbar(date) {
  return `<div class="local-violation-bar"><div class="local-field"><label>记录日期</label><input class="local-input" type="date" data-violation-picker value="${attr(date)}"></div>${button('回到今天', 'violations-today', 'small')}<span class="local-violation-tip">可以补录或修改任意历史日期；换日期、离开页面前如果有没保存的文字，会先问一句。</span></div>`;
}
