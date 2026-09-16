import { LOCAL_KEYS } from '../core/constants.js';
import { currentWeekday, fmtDate, today } from '../core/date.js';
import { attr, button, empty, esc, head, panel } from '../core/dom.js';
import { roster8 } from '../core/roster.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';
import {
  buildDraft,
  filterStudents,
  historyFor,
  normalizeRecords,
  orderStudents,
  pendingChanges,
  recordsForDate,
  unattachedRecords
} from '../domain/violations.js';

export const violationsDate = () => state.violationsDate || today;

// 花名册序号（从 1 开始）。排序规则会打乱行序，序号是这页唯一的稳定锚点。
const rosterIndex = new Map(roster8.map((student, index) => [student.id, index + 1]));

export function violationsView() {
  const date = violationsDate();
  const records = normalizeRecords(read(LOCAL_KEYS.violations, []));
  const saved = recordsForDate(records, date);
  const held = state.violationsDraft;
  const texts = held && held.date === date ? held.texts : buildDraft(roster8, saved);
  const historyStudent = state.violationsHistoryStudent ? roster8.find((student) => student.id === state.violationsHistoryStudent) || null : null;
  const ordered = orderStudents(saved, state.violationsSessionOrder);
  const filter = state.violationsFilter || '';
  return {
    date,
    records,
    saved,
    texts,
    filter,
    unattached: unattachedRecords(records),
    pending: pendingChanges(saved, texts),
    ordered,
    // 筛选只决定「显示哪些行」；ordered 始终是全班，保存与未保存计数都走它。
    shown: filterStudents(ordered, filter),
    historyStudent,
    history: historyStudent ? historyFor(records, historyStudent.id) : []
  };
}

// 学生姓名是打开个人历史的入口：标记用 data-action，载荷用 data-violation-history，
// 两个属性名分开，才不会和输入框的 data-violation-student 在事件冒泡里搅在一起（§5.9）。
function row(student, date, value, active) {
  const filled = String(value ?? '').trim() ? ' filled' : '';
  const name = `<button type="button" class="local-violation-name${active ? ' active' : ''}" title="查看 ${attr(student.name)} 的违纪历史" data-action="toggle-violation-history" data-violation-history="${attr(student.id)}">${esc(student.name)}</button>`;
  return `<div class="local-violation-row${filled}" data-violation-row="${attr(student.id)}"><span class="local-violation-index">${rosterIndex.get(student.id) ?? ''}</span>${name}<input class="local-input local-violation-input" type="text" value="${attr(value)}" data-violation-student="${attr(student.id)}" data-violation-date="${attr(date)}" aria-label="${attr(student.name)} 违纪记录"></div>`;
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

  return (
    head(
      '8班违纪记录',
      '每名学生每天只保留一段文字；把文字清空并保存，就等于删除这条记录。点学生姓名可以回看他/她的全部违纪历史。只服务 2025 级 8 班。',
      `<span class="local-violation-meta" data-violation-meta>${meta}</span>${button('放弃修改', 'reset-violations')}${button('保存当天违纪', 'save-violations', 'primary')}${button('打印', 'print-violations', 'small')}`
    ) +
    panel('当天违纪', `${toolbar(view.date, view.filter)}${failed}${hint}${filterNote(view)}${grid(view)}`, 'local-span-12') +
    historyDrawer(view)
  );
}

function grid(view) {
  if (!view.ordered.length) return empty('花名册里没有 8 班学生，请先检查学生数据。');
  const headRow = '<div class="local-violation-head"><span>序号</span><span>学生</span><span>违纪文字</span></div>';
  const rows = view.shown.length
    ? view.shown.map((student) => row(student, view.date, view.texts[student.id], view.historyStudent?.id === student.id)).join('')
    : empty(`没有名字含「${view.filter}」的学生`);
  return `${headRow}<div class="local-violation-list" data-violation-list>${rows}</div>`;
}

// 筛选生效时把状态摆明：显示几条、以及「保存仍然是全班」——否则很容易误以为只保存筛出来的这几个人。
function filterNote(view) {
  if (!view.filter) return '';
  return `<div class="local-filter-note"><span>正在筛选「${esc(view.filter)}」· 显示 ${view.shown.length} 人</span><span class="local-filter-hint">筛选只影响显示，保存仍然是全班</span>${button('清空筛选', 'clear-violation-filter', 'small')}</div>`;
}

// 个人违纪历史用右侧抽屉，不用行内展开：这页是 50 行的可滚动长表，展开一行会把下方内容整体推下去，
// 刚点开的学生在视口里的位置会跳（与 §5.8「别让正在操作的东西跳走」同源）。抽屉不动列表。
// 抽屉是只读的，刻意不显示任何条数或次数——需求 §3.1 明写不做人数与汇总统计。
function historyDrawer(view) {
  const student = view.historyStudent;
  if (!student) return '';
  const items = view.history.length
    ? `<ol class="local-history">${view.history
        .map(
          (record) =>
            `<li class="local-history-item"><div class="local-history-when"><span class="local-history-date">${esc(fmtDate(record.eventDate))}</span><span class="local-history-week">${esc(currentWeekday(record.eventDate) || '')}</span></div><p class="local-history-text">${esc(record.content)}</p>${button('跳到那天', `open-violation-date:${record.eventDate}`, 'small')}</li>`
        )
        .join('')}</ol>`
    : empty('这名学生还没有违纪记录。');
  return `<div class="local-drawer-backdrop" data-action="close-violation-history"></div><aside class="local-drawer" tabindex="-1" role="dialog" aria-label="${attr(student.name)} 的违纪历史"><div class="local-drawer-head"><div><h3>${esc(student.name)}</h3><p>违纪历史 · 仅供教师回顾，不做统计与排名</p></div>${button('关闭', 'close-violation-history', 'small')}</div><div class="local-drawer-body">${items}</div></aside>`;
}

// 日期选择与「定位学生」放在名单上方同一条细工具栏里，省下的纵向空间全给 50 行名单。
// 定位框是给 50 人名单用的：打一个字就把名单收到几行，不用一列一列扫。
function toolbar(date, filter) {
  return `<div class="local-violation-bar"><div class="local-field"><label>记录日期</label><input class="local-input" type="date" data-violation-picker value="${attr(date)}"></div><div class="local-field local-field-filter"><label>定位学生</label><input class="local-input" type="text" data-violation-filter value="${attr(filter)}" placeholder="输入姓名，一个字也能筛"></div>${button('回到今天', 'violations-today', 'small')}<span class="local-violation-tip">可以补录或修改任意历史日期；换日期、离开页面前如果有没保存的文字，会先问一句。</span></div>`;
}
