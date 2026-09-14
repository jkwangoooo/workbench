import { roster8, studentMap } from '../core/roster.js';

export const SEATING_ROWS = 8;
export const SEATING_COLUMNS = 9;
export const SEATING_VERSION = 1;

const KIND_BY_MARKER = { student: 'student', empty: 'empty', aisle: 'aisle', podium: 'podium' };

export function expectedKindAt(rowIndex, columnIndex) {
  if (rowIndex === 0) return 'podium';
  if (columnIndex === 4) return 'aisle';
  return undefined;
}

export function buildSeatingTemplateCsv() {
  const header = [`模板版本,${SEATING_VERSION}`, `行数,${SEATING_ROWS},列数,${SEATING_COLUMNS}`];
  const body = Array.from({ length: SEATING_ROWS }, (_, rowIndex) =>
    Array.from({ length: SEATING_COLUMNS }, (_, columnIndex) => (expectedKindAt(rowIndex, columnIndex) || 'empty').toUpperCase()).join(',')
  );
  return `${header.concat(body).join('\n')}\n`;
}

export function parseSeating(rows) {
  const errors = [];
  const first = (rows[0] || []).map((value) => String(value ?? '').trim());
  const second = (rows[1] || []).map((value) => String(value ?? '').trim());
  if (first.join('|') !== `模板版本|${SEATING_VERSION}` || second.join('|') !== `行数|${SEATING_ROWS}|列数|${SEATING_COLUMNS}`) {
    return { errors: ['座次模板版本、行数或列数不匹配'] };
  }
  if (rows.length !== SEATING_ROWS + 2) errors.push(`座次模板必须包含${SEATING_ROWS}行座位数据`);

  const cells = [];
  const seen = new Set();
  rows.slice(2, 2 + SEATING_ROWS).forEach((row, rowIndex) => {
    if (row.length !== SEATING_COLUMNS) errors.push(`第${rowIndex + 3}行列数不匹配`);
    for (let columnIndex = 0; columnIndex < SEATING_COLUMNS; columnIndex += 1) {
      const where = `第${rowIndex + 3}行第${columnIndex + 1}列`;
      const raw = String(row[columnIndex] ?? '').trim();
      const parts = raw.split(':');
      const marker = parts.shift().toLowerCase();
      const cellKind = KIND_BY_MARKER[marker];
      if (!cellKind) {
        errors.push(`${where}结构标记未知`);
        continue;
      }

      const name = parts.join(':').trim();
      const student = cellKind === 'student' ? studentMap.get(name) : null;
      if (cellKind === 'student' && !student) errors.push(`${where}未知姓名：${name}`);
      else if (student && !roster8.some((item) => item.id === student.id)) errors.push(`${where}不是8班学生：${name}`);
      if (student && seen.has(student.id)) errors.push(`学生重复出现在座次表：${name}`);
      if (student) seen.add(student.id);

      const expected = expectedKindAt(rowIndex, columnIndex);
      if (expected && cellKind !== expected) {
        errors.push(`${where}必须为${expected === 'podium' ? '讲台' : '过道'}结构`);
      } else if (!expected && (cellKind === 'podium' || cellKind === 'aisle')) {
        errors.push(`${where}结构格位置不合法`);
      }

      cells.push({ rowIndex, columnIndex, cellKind, studentId: student?.id, displayName: student?.name });
    }
  });

  return {
    layout: errors.length ? undefined : { templateVersion: SEATING_VERSION, rowCount: SEATING_ROWS, columnCount: SEATING_COLUMNS, cells },
    errors
  };
}
