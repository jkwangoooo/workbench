export type ImportPreview<T> = { data?: T; errors: string[]; sourceFileDiscarded: true };
export function exactStudentLookup(students: readonly { id: string; classId: string; displayName: string; sortOrder: number; active: boolean }[], classId: string) {
  const map = new Map<string, typeof students[number]>(); students.filter((s) => s.classId === classId && s.active).forEach((student) => { const key = student.displayName.trim(); if (map.has(key)) throw new Error('8班存在重名，必须先登记内部识别列'); map.set(key, student); }); return map;
}
