// 学生身份的稳定派生。
//
// 旧方案用「班级 + 序号」拼 ID（local-8-1），序号来自种子文件里的排列顺序。
// 而作业反馈、单元测试、听写成绩、分组表、座次表全都以这个 ID 为外键，
// 于是往种子里插一名学生或调一次顺序，全班历史记录就会静默错位到别人名下。
//
// 新方案对「稳定键」做 32 位 FNV-1a 哈希，取十六进制短码：
//   - 稳定：与学生在种子中的位置无关，只取决于学生本人的信息；
//   - 不泄露：真实学籍号/证件号只参与哈希，不会出现在 DOM、日志或备份里；
//   - 可读：形如 local-8-a1b2c3，一眼能看出班级。

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function fnv1a(text) {
  let hash = FNV_OFFSET_BASIS;
  const source = String(text);
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// 优先用证件类编号做键（全班唯一），都没有时退回姓名；
// 姓名可能重名，由 roster.js 负责在后缀上做去重。
export function stableKeyOf(student) {
  for (const field of ['provincialStudentNumber', 'examNumber', 'identityNumber']) {
    const value = String(student?.[field] ?? '').trim();
    if (value) return `${field}:${value}`;
  }
  return `name:${String(student?.name ?? '').trim()}`;
}

export function stableStudentId(classNumber, student) {
  return `local-${classNumber}-${fnv1a(stableKeyOf(student))}`;
}
