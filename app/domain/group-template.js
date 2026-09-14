import { roster8, studentMap } from '../core/roster.js';

export function parseGroup(rows) {
  const errors = [];
  const expected = ['组别', '成员1', '成员2', '成员3', '成员4', '组长'];
  const header = (rows[0] || []).map((value) => String(value ?? '').trim());
  if (header.join('|') !== expected.join('|')) return { errors: ['分组模板表头或列数不匹配'] };
  const groups = [];
  const names = new Set();
  const indexes = new Set();
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    if (row.length !== expected.length) errors.push(`第${line}行列数不匹配`);
    const groupIndex = Number(String(row[0] ?? '').trim());
    if (!Number.isInteger(groupIndex) || groupIndex < 1) {
      errors.push(`第${line}行组别无效`);
      return;
    }
    if (indexes.has(groupIndex)) errors.push(`组别重复：${groupIndex}`);
    indexes.add(groupIndex);
    const leader = String(row[5] ?? '').trim();
    const members = [];
    for (let slot = 0; slot < 4; slot += 1) {
      const name = String(row[slot + 1] ?? '').trim();
      if (!name) continue;
      const student = studentMap.get(name);
      if (!student || !roster8.some((item) => item.name === name)) errors.push(`第${line}行未知姓名：${name}`);
      else if (names.has(student.id)) errors.push(`第${line}行学生重复：${name}`);
      else names.add(student.id);
      members.push({
        studentId: student?.id || `invalid-${line}-${slot}`,
        displayName: name,
        groupIndex,
        slotIndex: slot,
        isLeader: name === leader
      });
    }
    if (leader && !members.some((member) => member.displayName === leader)) errors.push(`第${line}行组长不是本组成员：${leader}`);
    groups.push({ groupIndex, members });
  });
  return { layout: errors.length ? undefined : { templateVersion: 1, groups }, errors };
}
