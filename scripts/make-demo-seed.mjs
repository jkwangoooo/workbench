import { mkdir, writeFile } from 'node:fs/promises';

const COUNT = 50;
const CLASS_8 = '2025级8班';
const CLASS_7 = '2025级7班';

const pad = (n) => String(n).padStart(2, '0');

const class8 = Array.from({ length: COUNT }, (_, index) => {
  const n = pad(index + 1);
  return {
    name: `八班示例${n}`,
    sortOrder: index,
    identityNumber: `示例证件号-${n}`,
    provincialStudentNumber: `示例学籍辅号-${n}`,
    examNumber: `示例准考证-${n}`,
    profile: {
      性别: index % 2 === 0 ? '男' : '女',
      出生日期: `2012-0${(index % 9) + 1}-${pad((index % 28) + 1)}`,
      联系电话: `示例电话-${n}`,
      家庭住址: `示例地址-${n}`,
      备注: '脱敏演示数据，非真实学生'
    }
  };
});

const class7 = Array.from({ length: COUNT }, (_, index) => ({
  name: `七班示例${pad(index + 1)}`,
  sortOrder: index
}));

const payload = {
  _comment: '演示用脱敏数据，全部为虚构占位姓名与字段，不含任何真实学生信息。真实数据请替换本文件。',
  classes: [
    { name: CLASS_8, students: class8 },
    { name: CLASS_7, students: class7 }
  ]
};

await mkdir('private-data', { recursive: true });
const body = `// 演示用脱敏种子数据（虚构占位），由 scripts/make-demo-seed.mjs 生成。\n// 真实学生数据请直接替换本文件，形状保持一致；本目录已被 .gitignore 排除。\nwindow.WORKBENCH_SEED = ${JSON.stringify(payload, null, 2)};\n`;
await writeFile('private-data/students.js', body, 'utf8');

console.log(`已生成 private-data/students.js：${CLASS_8} ${class8.length} 人，${CLASS_7} ${class7.length} 人`);
