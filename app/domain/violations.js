import { roster8 } from '../core/roster.js';
import { uid } from '../core/storage.js';

// 违纪记录（需求 §3）：只服务 8 班，每名学生每天只保留一段文字，清空即删除。
// 不记录类型、严重程度、时间、地点、附件或处理结果，也不做任何人数/汇总统计。
//
// 存储形态是一维数组，一条记录 = 一名学生 + 一个日期：
//   { id, studentId, eventDate, content, lastRecordedAt, createdAt, updatedAt }
// 旧版本存的是 { id, date, student: 姓名, text }，本模块读取时统一归一化、写入时一律写新形态，
// 所以不需要单独的一次性迁移脚本，老数据也不会丢。

export const VIOLATION_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const text = (value) => String(value ?? '').trim();

// 老记录只存了姓名，靠这张表把 studentId 补回来。只认 8 班，同名取花名册在前的那个。
const nameIndex = new Map();
for (const student of roster8) if (!nameIndex.has(student.name)) nameIndex.set(student.name, student.id);

export function studentIdOfName(name) {
  return nameIndex.get(text(name)) || '';
}

// 时间和内容一致的合并：文字接起来而不是丢掉，符合「宁可留着也不丢数据」。
// 按分句去重，所以合并三次也不会把同一句话接三遍。
function mergeContents(first, second) {
  const parts = [first, second]
    .flatMap((value) => String(value || '').split('；'))
    .map((part) => part.trim())
    .filter(Boolean);
  return [...new Set(parts)].join('；');
}

function latest(first, second, fallback) {
  const values = [first, second].filter(Boolean).sort();
  return values.length ? values[values.length - 1] : fallback;
}

function earliest(first, second, fallback) {
  const values = [first, second].filter(Boolean).sort();
  return values.length ? values[0] : fallback;
}

function mergeRecords(first, second) {
  return {
    ...first,
    content: mergeContents(first.content, second.content),
    lastRecordedAt: latest(first.lastRecordedAt, second.lastRecordedAt, ''),
    updatedAt: latest(first.updatedAt, second.updatedAt, ''),
    createdAt: earliest(first.createdAt, second.createdAt, first.createdAt || '')
  };
}

export function normalizeRecord(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const eventDate = text(raw.eventDate || raw.date);
  const studentId = text(raw.studentId) || studentIdOfName(raw.student);
  const content = text(raw.content ?? raw.text);
  const lastRecordedAt = text(raw.lastRecordedAt) || text(raw.updatedAt) || text(raw.createdAt);
  return {
    id: text(raw.id) || uid('violation'),
    studentId,
    eventDate,
    content,
    lastRecordedAt,
    createdAt: text(raw.createdAt) || lastRecordedAt,
    updatedAt: text(raw.updatedAt) || lastRecordedAt
  };
}

// 归一化整份数据。同学生同日出现多条（旧版本允许）时合并成一条，满足唯一约束又不丢文字。
// 认不出学生或没有日期的记录原样保留，但不参与当日视图 —— 会由页面显式提示条数。
export function normalizeRecords(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const byKey = new Map();
  const unattached = [];
  for (const item of list) {
    const record = normalizeRecord(item);
    if (!record) continue;
    if (!record.studentId || !record.eventDate) {
      unattached.push(record);
      continue;
    }
    const key = `${record.eventDate}|${record.studentId}`;
    byKey.set(key, byKey.has(key) ? mergeRecords(byKey.get(key), record) : record);
  }
  return unattached.concat([...byKey.values()]);
}

export function unattachedRecords(records) {
  return records.filter((record) => !record.studentId || !record.eventDate);
}

export function recordsForDate(records, date) {
  const map = new Map();
  for (const record of records) if (record.studentId && record.eventDate === date) map.set(record.studentId, record);
  return map;
}

// 显示顺序（需求 §3.3）：本次会话刚编辑过的最前 → 当日已有记录的按 last_recorded_at 倒序 →
// 其余按花名册原始顺序。同一批一起保存的记录时间戳相同，退化为花名册顺序，结果始终确定。
export function orderStudents(savedByStudent, sessionOrder = [], students = roster8) {
  const edited = new Map(sessionOrder.map((id, index) => [id, index]));
  return students
    .map((student, index) => {
      const record = savedByStudent.get(student.id);
      const editedIndex = edited.has(student.id) ? edited.get(student.id) : -1;
      if (editedIndex >= 0) return { student, group: 0, key: editedIndex, tie: index };
      if (record) return { student, group: 1, key: -Date.parse(record.lastRecordedAt || 0) || 0, tie: index };
      return { student, group: 2, key: 0, tie: student.sortOrder ?? index };
    })
    .sort((a, b) => a.group - b.group || a.key - b.key || a.tie - b.tie)
    .map((row) => row.student);
}

// 当天草稿：全班每人的当前文字（已保存的原样带入，其余为空）。
export function buildDraft(students, savedByStudent) {
  const draft = {};
  for (const student of students) draft[student.id] = savedByStudent.get(student.id)?.content || '';
  return draft;
}

// 草稿与已保存内容的差异清单（比较前都去掉首尾空白）。空数组表示没有未保存修改。
export function pendingChanges(savedByStudent, texts, students = roster8) {
  return students.filter((student) => text(texts?.[student.id]) !== (savedByStudent.get(student.id)?.content || '')).map((student) => student.id);
}

// 由整份数据 + 当天草稿算出下一版整份数据，纯函数，不改入参。
// 本日 + 8 班学生的旧记录全部由草稿重算，其余记录（其他日期、认不出的）原样带走。
export function diffDay(allRecords, date, draft, students = roster8, now = new Date()) {
  const unchanged = { records: allRecords, added: [], updated: [], removed: [], problems: [] };

  if (!VIOLATION_DATE_RE.test(date)) {
    return {
      ...unchanged,
      problems: [{ studentId: '', name: '日期', reason: `日期「${date || '空'}」不是 YYYY-MM-DD，整批未保存` }]
    };
  }

  const byId = new Map(students.map((student) => [student.id, student]));
  const nextTexts = new Map();
  const problems = [];
  for (const [studentId, value] of Object.entries(draft || {})) {
    const student = byId.get(studentId);
    if (!student) {
      problems.push({ studentId, name: studentId, reason: '不在 8 班名单里，整批未保存' });
      continue;
    }
    const content = text(value);
    if (content) nextTexts.set(studentId, content); // 清空即删除，不写空行
  }
  if (problems.length) return { ...unchanged, problems };

  const saved = new Map();
  const others = [];
  for (const record of allRecords) {
    if (record.studentId && record.eventDate === date) saved.set(record.studentId, record);
    else others.push(record);
  }

  const stamp = now.toISOString();
  const added = [];
  const updated = [];
  const removed = [];
  const fresh = [];
  for (const [studentId, content] of nextTexts) {
    const before = saved.get(studentId);
    if (!before) {
      fresh.push({ id: uid('violation'), studentId, eventDate: date, content, lastRecordedAt: stamp, createdAt: stamp, updatedAt: stamp });
      added.push(studentId);
    } else if (before.content !== content) {
      fresh.push({ ...before, content, lastRecordedAt: stamp, updatedAt: stamp });
      updated.push(studentId);
    } else {
      fresh.push(before); // 没动过的记录保持原时间戳，置顶顺序才不会乱
    }
  }
  for (const studentId of saved.keys()) if (!nextTexts.has(studentId)) removed.push(studentId);

  return { records: others.concat(fresh), added, updated, removed, problems: [] };
}
