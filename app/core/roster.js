import { class7Name, class8Name } from './constants.js';
import { stableKeyOf, fnv1a } from './student-id.js';

export const seed = window.WORKBENCH_SEED || { classes: [] };

export const classByNumber = (number) =>
  seed.classes.find((item) => item.name.includes(number + '班')) || { name: number === '8' ? class8Name : class7Name, students: [] };

// 稳定 ID 由学生本人信息派生，与排列顺序无关；重名学生（以姓名为键时）按稳定顺序补后缀。
export function normalizeStudents(classRecord, number) {
  const used = new Map();
  return (classRecord.students || [])
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((student, index) => {
      const base = `local-${number}-${fnv1a(stableKeyOf(student))}`;
      const hit = (used.get(base) || 0) + 1;
      used.set(base, hit);
      return {
        id: hit === 1 ? base : `${base}-${hit}`,
        legacyId: `local-${number}-${index + 1}`,
        name: String(student.name || '').trim(),
        sortOrder: student.sortOrder ?? index,
        identityNumber: student.identityNumber || '',
        provincialStudentNumber: student.provincialStudentNumber || '',
        examNumber: student.examNumber || '',
        profile: student.profile || {}
      };
    });
}

export const roster8 = normalizeStudents(classByNumber('8'), '8');
export const roster7 = normalizeStudents(classByNumber('7'), '7');
export const rosterFor = (number) => (number === '7' ? roster7 : roster8);
export const studentMap = new Map(roster8.concat(roster7).map((student) => [student.name, student]));

// 旧 ID（local-8-1 形式）→ 稳定 ID，供 app/domain/migrate.js 做一次性迁移。
export const legacyIdMap = new Map(roster8.concat(roster7).map((student) => [student.legacyId, student.id]));
