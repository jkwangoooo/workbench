// CSV 导出（L6-2）：把成绩表转成 CSV 字符串，纯函数、可单测。
//
// 与 print-reports.js 一样只做「数据 → 字符串」的纯转换，下载动作由 main.js 负责。

import { class7Name, class8Name } from '../core/constants.js';
import { rosterFor } from '../core/roster.js';
import { rankFor } from './ranking.js';

// CSV 单元格转义：含逗号/引号/换行时套引号，内部引号翻倍。
function cell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

// 加 BOM 让 Excel 直接以 UTF-8 打开中文不乱码。
function withBom(content) {
  return `\uFEFF${content}`;
}

/** 单元测试成绩 → CSV：表头 + 每名学生一行（姓名、成绩、当前排名、历史排名对照）。 */
export function buildTestCsv(test, classNumber) {
  const header = ['姓名', '成绩', '当前排名', '历史排名对照'];
  const body = rosterFor(classNumber).map((student) => {
    const score = test.scores[student.id] ?? '';
    const rank = rankFor(test, student.id);
    const reference = test.references?.[student.id] ? `${test.references[student.id]} → ${rank}` : '';
    return [student.name, score, rank, reference];
  });
  return withBom(toCsv([header, ...body]));
}

/** 听写成绩 → CSV：表头含目标分与各听写列，每名学生一行。 */
export function buildDictationCsv(sheet, classNumber) {
  const header = ['姓名', '目标分', ...sheet.columns.map((column) => `${column.date} ${column.name}`), '状态'];
  const body = rosterFor(classNumber).map((student) => {
    const target = sheet.targets[student.id] ?? '';
    const scores = sheet.columns.map((column) => sheet.scores[`${student.id}:${column.id}`] ?? '');
    const completed = scores.length && scores.every((score) => score !== '') && scores.every((score) => Number(score) >= Number(target || 0));
    const status = scores.length && scores.every((score) => score !== '') ? (completed ? '达成' : '未达成') : '进行中';
    return [student.name, target, ...scores, status];
  });
  return withBom(toCsv([header, ...body]));
}

/** 导出文件名的班级前缀，供下载动作拼文件名。 */
export function classNameOf(classNumber) {
  return classNumber === '7' ? class7Name : class8Name;
}
