#!/usr/bin/env node
// 真实学生名单导入：把教务导出的 CSV / XLSX 转成 private-data/students.js。
//
// 用法：
//   node scripts/import-roster.mjs <名单文件.csv|xlsx> [选项]
//
// 选项：
//   --class "2025级8班,2025级7班"   指定班级名（多个用逗号分隔）。缺省时按文件里的「班级」列自动拆分。
//   --sheet "Sheet1"               读 XLSX 时指定工作表名，缺省读第一个工作表。
//   --out <路径>                    输出文件，缺省 private-data/students.js。
//   --dry-run                       只打印识别结果与校验报告，不写文件。
//
// 自动识别这些列（大小写、前后空格、常见别名都不影响）：
//   姓名     name / 学生姓名 / 姓名 / 学生 / 名字
//   班级     班级 / class / 班别 / 所属班级 / 行政班
//   省学籍辅号 省学籍辅号 / 学籍辅号 / 学籍号 / 省学籍号 / 学籍辅号
//   准考证号  准考证号 / 准考证 / 考号 / 考生号
//   证件号   证件号 / 身份证号 / 身份证 / 证件号码 / 学籍号（当无单独学籍辅号列时）
//   性别     性别 / sex / gender
//   出生日期  出生日期 / 出生年月 / 生日 / 出生
//   联系电话  联系电话 / 电话 / 手机 / 手机号 / 家长电话
//   家庭住址  家庭住址 / 住址 / 地址 / 家庭地址
//   备注     备注 / 说明 / note
//
// 稳定键优先级与 app/core/student-id.js 一致：
//   省学籍辅号 > 准考证号 > 证件号 > 姓名（退回姓名时有重名风险，会打印警告）。
//
// 本脚本只读你指定的文件、只写你指定的输出文件，不上传任何数据。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from 'xlsx';

const { read: readXlsx, utils: XlsxUtils } = pkg;

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// —— 列名别名表：每个规范字段对应一组常见表头（统一小写、去空格后比对）——
const COLUMN_ALIASES = {
  name: ['姓名', '学生姓名', '学生', '名字', 'name', 'studentname', 'student_name'],
  className: ['班级', '班别', '所属班级', '行政班', '班级名称', 'class', 'classname', 'class_name'],
  provincialStudentNumber: ['省学籍辅号', '学籍辅号', '学籍号', '省学籍号', '学籍辅号', '省学籍', 'provincialstudentnumber'],
  examNumber: ['准考证号', '准考证', '考号', '考生号', '考试号', '学号', '学生学号', 'examnumber', 'examno', 'exam_no', 'studentnumber', 'studentno'],
  identityNumber: ['证件号', '身份证号', '身份证', '证件号码', '身份证号码', 'identitynumber', 'idnumber', 'id_number', '证件编号'],
  gender: ['性别', 'sex', 'gender'],
  birthDate: ['出生日期', '出生年月', '生日', '出生', 'birthdate', 'birthday', '出生时间'],
  phone: ['联系电话', '电话', '手机', '手机号', '家长电话', '联系手机', 'phone', 'mobile', 'tel'],
  address: ['家庭住址', '住址', '地址', '家庭地址', '现住址', 'address', 'homeaddress'],
  note: ['备注', '说明', 'note', 'remark', 'remarks']
};

// 班级名归一化：把「8班」「八班」「八年级8班」这类都归成「N班」用于匹配。
function classNumberFrom(text) {
  const source = String(text ?? '').trim();
  const chinese = { 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' };
  const mapped = source.replace(/[一二三四五六七八九]/g, (char) => chinese[char]);
  const match = mapped.match(/(\d+)\s*班/);
  return match ? match[1] : null;
}

function normalizeHeader(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

// 把表头映射成规范字段名；认不出的列忽略。
function mapColumns(headerRow) {
  const mapping = {};
  for (let index = 0; index < headerRow.length; index += 1) {
    const normalized = normalizeHeader(headerRow[index]);
    for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (aliases.map(normalizeHeader).includes(normalized)) {
        if (mapping[field] === undefined) mapping[field] = index;
        break;
      }
    }
  }
  return mapping;
}

function cellOf(row, mapping, field) {
  const index = mapping[field];
  if (index === undefined) return '';
  return String(row[index] ?? '').trim();
}

// —— 命令行参数解析 ——
function parseArgs(argv) {
  const args = { input: null, classNames: null, sheet: null, out: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--class') args.classNames = argv[++index];
    else if (token === '--sheet') args.sheet = argv[++index];
    else if (token === '--out') args.out = argv[++index];
    else if (token === '--dry-run') args.dryRun = true;
    else if (!args.input && !token.startsWith('--')) args.input = token;
  }
  return args;
}

// —— 读文件：CSV 或 XLSX 都转成「表头 + 数据行」——
function readRowsFromFile(filePath, sheetName) {
  if (!existsSync(filePath)) throw new Error(`文件不存在：${filePath}`);
  const isCsv = /\.csv$/i.test(filePath);
  const workbook = isCsv
    ? readXlsx(readFileSync(filePath, 'utf8'), { type: 'string' })
    : readXlsx(readFileSync(filePath), { type: 'buffer', cellDates: true });
  const sheet = sheetName ? workbook.Sheets[sheetName] : workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    const available = workbook.SheetNames.join('、');
    throw new Error(`找不到工作表「${sheetName ?? ''}」，可选：${available}`);
  }
  const matrix = XlsxUtils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  return matrix.filter((row) => row.some((value) => String(value).trim() !== ''));
}

function formatDate(value) {
  if (value === '' || value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Excel 数字日期（自 1899-12-30 的天数），可能是 number 或字符串形式
  const asNumber = typeof value === 'number' ? value : Number(value);
  if (!Number.isNaN(asNumber) && asNumber > 20000 && asNumber < 60000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(asNumber) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : text;
}

// —— 主流程 ——
function buildSeed(matrix, requestedClasses) {
  const header = matrix[0];
  const dataRows = matrix.slice(1);
  const mapping = mapColumns(header);
  if (mapping.name === undefined) {
    const columns = header.join('、');
    throw new Error(`没找到「姓名」列。表头是：${columns}`);
  }

  // 按班级分组
  const classMap = new Map();
  for (const row of dataRows) {
    const name = cellOf(row, mapping, 'name');
    if (!name) continue;
    const rawClass = cellOf(row, mapping, 'className').replace(/\s+/g, '');
    const classNumber = classNumberFrom(rawClass) || (requestedClasses ? classNumberFrom(requestedClasses[0]) : null) || '8';
    // 班级名：优先用文件里「班级」列的原文（保留「2025级」这类前缀）；
    // 没有班级列时退回 --class 参数，再退回「N班」。
    const className = rawClass
      ? rawClass
      : requestedClasses && requestedClasses.length
        ? requestedClasses.find((cn) => classNumberFrom(cn) === classNumber) || `${classNumber}班`
        : `${classNumber}班`;
    if (!classMap.has(className)) classMap.set(className, []);
    classMap.get(className).push({ row, name, classNumber, className });
  }

  // 若指定了班级名但没在文件里出现，也建一个空班（保持两班结构）
  if (requestedClasses) {
    for (const cn of requestedClasses) {
      if (!classMap.has(cn)) classMap.set(cn, []);
    }
  }

  const classes = [...classMap.entries()].map(([className, students]) => {
    const list = students
      .map((item, index) => {
        const profile = {};
        for (const field of ['gender', 'birthDate', 'phone', 'address', 'note']) {
          const value = field === 'birthDate' ? formatDate(cellOf(item.row, mapping, field)) : cellOf(item.row, mapping, field);
          if (value) profile[LABEL[field]] = value;
        }
        return {
          name: item.name,
          sortOrder: index,
          identityNumber: cellOf(item.row, mapping, 'identityNumber'),
          provincialStudentNumber: cellOf(item.row, mapping, 'provincialStudentNumber'),
          examNumber: cellOf(item.row, mapping, 'examNumber'),
          profile
        };
      })
      .map((student) => {
        // 去掉空字符串键，保持与 demo seed 结构一致（demo 里 8 班有完整字段，7 班只有 name/sortOrder）
        const cleaned = { name: student.name, sortOrder: student.sortOrder };
        if (student.identityNumber) cleaned.identityNumber = student.identityNumber;
        if (student.provincialStudentNumber) cleaned.provincialStudentNumber = student.provincialStudentNumber;
        if (student.examNumber) cleaned.examNumber = student.examNumber;
        if (Object.keys(student.profile).length) cleaned.profile = student.profile;
        return cleaned;
      });
    return { name: className, students: list };
  });

  return { classes };
}

const LABEL = {
  gender: '性别',
  birthDate: '出生日期',
  phone: '联系电话',
  address: '家庭住址',
  note: '备注'
};

// —— 稳定键覆盖率与重名检测（对齐 app/core/student-id.js）——
function stableKeyOf(student) {
  for (const field of ['provincialStudentNumber', 'examNumber', 'identityNumber']) {
    const value = String(student[field] ?? '').trim();
    if (value) return `${field}:${value}`;
  }
  return `name:${String(student.name ?? '').trim()}`;
}

function audit(seed) {
  const report = [];
  for (const cls of seed.classes) {
    const students = cls.students;
    const withKey = students.filter((s) => ['provincialStudentNumber', 'examNumber', 'identityNumber'].some((f) => String(s[f] ?? '').trim())).length;
    const byName = students.length - withKey;
    const names = new Set();
    const duplicates = new Set();
    for (const s of students) {
      if (names.has(s.name)) duplicates.add(s.name);
      names.add(s.name);
    }
    report.push({
      className: cls.name,
      count: students.length,
      withKey,
      byName,
      duplicateNames: [...duplicates]
    });
  }
  return report;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.log('用法：node scripts/import-roster.mjs <名单文件.csv|xlsx> [--class "2025级8班,2025级7班"] [--sheet Sheet1] [--out 路径] [--dry-run]');
    process.exitCode = 1;
    return;
  }

  const requestedClasses = args.classNames
    ? args.classNames
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;
  const matrix = readRowsFromFile(resolve(args.input), args.sheet);
  const header = matrix[0] || [];
  const mapping = mapColumns(header);

  const recognized = Object.entries(COLUMN_ALIASES)
    .filter(([field]) => mapping[field] !== undefined)
    .map(([field]) => field);
  console.log(`识别到 ${matrix.length - 1} 行数据，表头 ${header.length} 列。`);
  console.log(`识别到的字段：${recognized.join('、') || '（无）'}`);

  const seed = buildSeed(matrix, requestedClasses);
  const report = audit(seed);

  console.log('');
  for (const item of report) {
    const warn = item.byName > 0 ? `（⚠ ${item.byName} 人缺稳定键，将退回姓名，重名会错位）` : '';
    const dup = item.duplicateNames.length ? `（⚠ 重名：${item.duplicateNames.join('、')}）` : '';
    console.log(`${item.className}：${item.count} 人，稳定键覆盖 ${item.withKey}${warn}${dup}`);
  }

  const payload = { classes: seed.classes };
  const body = `// 真实学生名单（由 scripts/import-roster.mjs 生成）。\n// 本目录已被 .gitignore 排除，切勿提交真实姓名/证件号/成绩。\nwindow.WORKBENCH_SEED = ${JSON.stringify(payload, null, 2)};\n`;

  if (args.dryRun) {
    console.log('\n（--dry-run）未写文件。');
    return;
  }

  const outPath = resolve(args.out || join(PROJECT_ROOT, 'private-data', 'students.js'));
  writeFileSync(outPath, body, 'utf8');
  console.log(`\n已写入：${outPath}`);
}

main();
