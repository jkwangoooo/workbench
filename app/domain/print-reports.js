// 打印报告（L6-1）：把成绩表与违纪记录转成可打印的独立 HTML 文档。
//
// 只做「数据 → HTML 字符串」的纯转换，不碰 window / document / 打印窗口，
// 这样既能单测，又能被 main.js 的打印动作直接复用（与 layouts.js 的打印窗口一致）。

import { class7Name, class8Name } from '../core/constants.js';
import { fmtDate } from '../core/date.js';
import { rosterFor, roster8 } from '../core/roster.js';
import { rankFor } from './ranking.js';

// 打印文档的公共样式：A4 横向、表格式布局，与 layouts.js 的打印风格对齐。
export const PRINT_STYLE = `@page{size:A4 landscape;margin:12mm}body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#17212b}h1{font-size:22px;font-weight:600;margin:0 0 6px}.meta{font-size:13px;color:#67737c;margin:0 0 18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccd7dc;padding:6px 8px;text-align:left}th{background:#eef3f6;font-weight:600}td.num,th.num{text-align:right}.muted{color:#a0aab1}.empty{color:#a0aab1;padding:24px;text-align:center}`;

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function wrap(title, meta, body) {
  return `<html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_STYLE}</style></head><body><h1>${esc(title)}</h1><p class="meta">${esc(meta)}</p>${body}</body></html>`;
}

/** 单元测试成绩表：姓名 / 成绩 / 当前排名 / 历史排名对照。 */
export function testReport(test, classNumber) {
  if (!test) return wrap('单元测试成绩', '', '<p class="empty">还没有测试数据。</p>');
  const className = classNumber === '7' ? class7Name : class8Name;
  const rows = rosterFor(classNumber)
    .map((student) => {
      const score = test.scores[student.id] ?? '';
      const rank = rankFor(test, student.id);
      const reference = test.references?.[student.id] ? `${test.references[student.id]} → ${rank}` : '—';
      return `<tr><td>${esc(student.name)}</td><td class="num">${score === '' ? '' : esc(score)}</td><td class="num">${esc(rank)}</td><td class="num">${esc(reference)}</td></tr>`;
    })
    .join('');
  return wrap(
    `${className} 单元测试成绩`,
    `${test.title} · 满分 ${test.fullScore}`,
    `<table><thead><tr><th>姓名</th><th class="num">成绩</th><th class="num">当前排名</th><th class="num">历史排名对照</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

/** 听写成绩表：姓名 / 目标分 / 各听写列 / 达成状态。 */
export function dictationReport(sheet, classNumber) {
  if (!sheet) return wrap('听写成绩', '', '<p class="empty">还没有听写数据。</p>');
  const className = classNumber === '7' ? class7Name : class8Name;
  const rows = rosterFor(classNumber)
    .map((student) => {
      const target = sheet.targets[student.id] ?? '';
      const scores = sheet.columns.map((column) => sheet.scores[`${student.id}:${column.id}`] ?? '');
      const completed = scores.length && scores.every((score) => score !== '') && scores.every((score) => Number(score) >= Number(target || 0));
      const status = scores.length && scores.every((score) => score !== '') ? (completed ? '达成' : '未达成') : '进行中';
      return `<tr><td>${esc(student.name)}</td><td class="num">${esc(target)}</td>${scores.map((score) => `<td class="num">${esc(score)}</td>`).join('')}<td>${esc(status)}</td></tr>`;
    })
    .join('');
  return wrap(
    `${className} 听写成绩`,
    `${sheet.title} · 满分 100`,
    `<table><thead><tr><th>姓名</th><th class="num">目标分</th>${sheet.columns.map((column) => `<th class="num">${esc(column.date)} ${esc(column.name)}</th>`).join('')}<th>状态</th></tr></thead><tbody>${rows}</tbody></table>`
  );
}

/** 违纪记录表：按日期汇总，某天谁有记录、内容是什么。 */
export function violationsReport(records) {
  // 按事件日期分组，组内按花名册顺序（roster8 本身就是花名册顺序）。
  const byDate = new Map();
  for (const record of records) {
    if (!record.eventDate) continue;
    if (!byDate.has(record.eventDate)) byDate.set(record.eventDate, []);
    byDate.get(record.eventDate).push(record);
  }
  const dates = [...byDate.keys()].sort();
  if (!dates.length) return wrap('8班违纪记录', '', '<p class="empty">还没有违纪记录。</p>');

  const nameOf = new Map(roster8.map((student) => [student.id, student.name]));
  const sections = dates
    .map((date) => {
      const rows = byDate
        .get(date)
        .map((record) => `<tr><td>${esc(nameOf.get(record.studentId) || '未知学生')}</td><td>${esc(record.content || '')}</td></tr>`)
        .join('');
      return `<h2 style="font-size:15px;margin:18px 0 8px">${esc(fmtDate(date))}</h2><table><thead><tr><th style="width:140px">学生</th><th>违纪内容</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join('');
  return wrap('8班违纪记录', `共 ${records.length} 条记录、覆盖 ${dates.length} 天`, sections);
}
