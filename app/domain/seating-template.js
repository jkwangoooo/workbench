import { roster8, studentMap } from '../core/roster.js';

export function parseSeating(rows) {
  const errors = [];
  const first = (rows[0] || []).map((v) => String(v ?? '').trim());
  const second = (rows[1] || []).map((v) => String(v ?? '').trim());
  if (first.join('|') !== '模板版本|1' || second.join('|') !== '行数|8|列数|9') return { errors: ['座次模板版本、行数或列数不匹配'] };
  if (rows.length !== 10) errors.push('座次模板必须包含8行座位数据');
  const cells = [];
  const seen = new Set();
  rows.slice(2, 10).forEach((row, rowIndex) => {
    if (row.length !== 9) errors.push(`第${rowIndex + 3}行列数不匹配`);
    for (let columnIndex = 0; columnIndex < 9; columnIndex += 1) {
      const raw = String(row[columnIndex] ?? '').trim();
      const parts = raw.split(':');
      const kind = parts.shift().toLowerCase();
      const cellKind = { student: 'student', empty: 'empty', aisle: 'aisle', podium: 'podium' }[kind];
      if (!cellKind) {
        errors.push(`第${rowIndex + 3}行第${columnIndex + 1}列结构标记未知`);
        continue;
      }
      const name = parts.join(':').trim();
      const student = cellKind === 'student' ? studentMap.get(name) : null;
      if (cellKind === 'student' && (!student || !roster8.some((item) => item.name === name)))
        errors.push(`第${rowIndex + 3}行第${columnIndex + 1}列未知姓名：${name}`);
      if (student && seen.has(student.id)) errors.push(`学生重复出现在座次表：${name}`);
      if (student) seen.add(student.id);
      cells.push({ rowIndex, columnIndex, cellKind, studentId: student?.id, displayName: student?.name });
    }
  });
  if (cells.length && cells[0].cellKind !== 'podium') errors.push('座次表第1行第1列必须为讲台结构');
  if (cells.length && cells[4].cellKind !== 'aisle') errors.push('座次表第1行第5列必须为过道结构');
  for (let row = 0; row < 8; row += 1) {
    const podium = cells.find((cell) => cell.rowIndex === row && cell.columnIndex === 0);
    if (row === 0 && podium?.cellKind !== 'podium') errors.push('座次表第1行讲台位置不正确');
    const aisle = cells.find((cell) => cell.rowIndex === row && cell.columnIndex === 4);
    if (aisle?.cellKind !== 'aisle') errors.push(`座次表第${row + 1}行第5列必须为过道结构`);
  }
  return { layout: errors.length ? undefined : { templateVersion: 1, rowCount: 8, columnCount: 9, cells }, errors };
}
