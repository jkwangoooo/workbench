import { class7Name, class8Name } from './constants.js';

export const seed = window.WORKBENCH_SEED || { classes: [] };

export const classByNumber = (number) =>
  seed.classes.find((item) => item.name.includes(number + '班')) || { name: number === '8' ? class8Name : class7Name, students: [] };
export const roster8 = normalizeStudents(classByNumber('8'), true);
export const roster7 = normalizeStudents(classByNumber('7'), false);
export const rosterFor = (number) => (number === '7' ? roster7 : roster8);
export const studentMap = new Map(roster8.concat(roster7).map((student) => [student.name, student]));

export function normalizeStudents(classRecord, fullProfile) {
  return (classRecord.students || [])
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map((student, index) => ({
      id: `local-${fullProfile ? '8' : '7'}-${index + 1}`,
      name: String(student.name || '').trim(),
      sortOrder: student.sortOrder ?? index,
      identityNumber: student.identityNumber || '',
      provincialStudentNumber: student.provincialStudentNumber || '',
      examNumber: student.examNumber || '',
      profile: student.profile || {}
    }));
}
