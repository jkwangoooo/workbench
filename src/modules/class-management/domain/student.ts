export type RosterStudent = {
  id: string;
  classId: string;
  displayName: string;
  identityDocumentNo: string;
  provincialStudentNo: string;
  examNo: string;
  sortOrder: number;
  active: boolean;
};

export type ProfileField = { key: string; label: string; value: string; sensitive: boolean };

export const profileGroups = [
  { title: '基础信息', keys: ['姓名', '请选择性别', '学生身份证号'] },
  { title: '健康与个人情况', keys: ['身体健康情况', '民族', '出生年月', '特长爱好', '孩子优点'] },
  { title: '联系方式', keys: ['常用联系电话'] },
  { title: '家庭信息', keys: ['家庭住址', '父亲姓名', '父亲联系电话', '父亲工作单位', '母亲姓名', '母亲联系电话', '母亲工作单位'] }
] as const;

export const sensitiveProfileKeys = new Set([
  '学生身份证号', '出生年月', '身体健康情况', '民族', '家庭住址', '常用联系电话',
  '父亲姓名', '父亲联系电话', '父亲工作单位', '母亲姓名', '母亲联系电话', '母亲工作单位'
]);

export function filterRoster(students: readonly RosterStudent[], query: string): RosterStudent[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...students];
  return students.filter((student) => [student.displayName, student.identityDocumentNo, student.provincialStudentNo, student.examNo]
    .some((value) => value.toLowerCase().includes(needle)));
}

export function maskProfileField(field: ProfileField, revealed: boolean): string {
  return field.sensitive && !revealed ? '已隐藏' : field.value || '未填写';
}
