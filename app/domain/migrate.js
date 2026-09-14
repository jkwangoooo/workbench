import { LOCAL_KEYS } from '../core/constants.js';
import { legacyIdMap } from '../core/roster.js';
import { read, write } from '../core/storage.js';
import { collectData } from './backup.js';
import { feedbackIdOf, isHomeworkV2 } from './homework.js';

export const STUDENT_ID_SCHEMA = 'student-id-v1';

// 把一份数据快照里以旧学生 ID 为外键的引用改写成稳定 ID。
// 纯函数：不改动入参，返回新对象和改写条数，便于直接测试。
function remapKeyedObject(input, map) {
  if (!input || typeof input !== 'object') return { value: input, changed: 0 };
  const value = {};
  let changed = 0;
  for (const [key, entry] of Object.entries(input)) {
    const nextKey = map.get(key) || key;
    if (nextKey !== key) changed += 1;
    value[nextKey] = entry;
  }
  return { value, changed };
}

// 成绩类字段的键有两种形态：单元测试是「学生ID」，听写成绩是「学生ID:听写列ID」。
function remapScoreKeys(input, map) {
  if (!input || typeof input !== 'object') return { value: input, changed: 0 };
  const value = {};
  let changed = 0;
  for (const [key, entry] of Object.entries(input)) {
    const cut = key.indexOf(':');
    const head = cut < 0 ? key : key.slice(0, cut);
    const tail = cut < 0 ? '' : key.slice(cut);
    const nextHead = map.get(head) || head;
    if (nextHead !== head) changed += 1;
    value[`${nextHead}${tail}`] = entry;
  }
  return { value, changed };
}

// 作业反馈是两层键：外层「班级:日期」，内层才是学生 ID。
function remapGroupedRecords(input, map) {
  if (!input || typeof input !== 'object') return { value: input, changed: 0 };
  const value = {};
  let changed = 0;
  for (const [groupKey, group] of Object.entries(input)) {
    const inner = remapKeyedObject(group, map);
    changed += inner.changed;
    value[groupKey] = inner.value;
  }
  return { value, changed };
}

// 作业反馈自 L2 起是「作业 + 学生反馈」两张表（见 app/domain/homework.js），
// 旧的两层键形态仍然要能迁移，所以两种形态都认。
function remapHomework(input, map) {
  if (!input || typeof input !== 'object') return { value: input, changed: 0 };
  if (!isHomeworkV2(input)) return remapGroupedRecords(input, map);

  let changed = 0;
  const rows = Array.isArray(input.feedback) ? input.feedback : [];
  const feedback = rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const nextId = map.get(row.studentId);
    if (!nextId || nextId === row.studentId) return row;
    changed += 1;
    // id 里嵌着学生 ID，一起换掉，免得同一条反馈出现两个不同的 id。
    return { ...row, studentId: nextId, id: feedbackIdOf(row.homeworkId, nextId) };
  });
  return { value: { ...input, feedback }, changed };
}

function remapSheetFields(sheet, map) {
  if (!sheet || typeof sheet !== 'object') return { value: sheet, changed: 0 };
  const next = { ...sheet };
  let changed = 0;
  for (const field of ['targets', 'references']) {
    if (!sheet[field]) continue;
    const result = remapKeyedObject(sheet[field], map);
    next[field] = result.value;
    changed += result.changed;
  }
  if (sheet.scores) {
    const result = remapScoreKeys(sheet.scores, map);
    next.scores = result.value;
    changed += result.changed;
  }
  return { value: next, changed };
}

function remapSheets(list, map) {
  let changed = 0;
  const value = list.map((sheet) => {
    const result = remapSheetFields(sheet, map);
    changed += result.changed;
    return result.value;
  });
  return { value, changed };
}

function remapMembers(list, map) {
  let changed = 0;
  const value = list.map((entry) => {
    const nextId = typeof entry === 'object' && entry ? map.get(entry.studentId) : undefined;
    if (!nextId || nextId === entry.studentId) return entry;
    changed += 1;
    return { ...entry, studentId: nextId };
  });
  return { value, changed };
}

function remapGroupLayout(layout, map) {
  if (!Array.isArray(layout?.groups)) return { value: layout, changed: 0 };
  let changed = 0;
  const groups = layout.groups.map((group) => {
    if (!Array.isArray(group?.members)) return group;
    const result = remapMembers(group.members, map);
    changed += result.changed;
    return { ...group, members: result.value };
  });
  return { value: { ...layout, groups }, changed };
}

function remapSeatingLayout(layout, map) {
  if (!Array.isArray(layout?.cells)) return { value: layout, changed: 0 };
  const result = remapMembers(layout.cells, map);
  return { value: { ...layout, cells: result.value }, changed: result.changed };
}

// 迁移不认识的旧 ID 一律原样保留：宁可留着，也不要因为种子缺人而丢数据。
export function remapStudentIds(data, map = legacyIdMap) {
  const next = { ...data };
  let changed = 0;
  const take = (result) => {
    changed += result.changed;
    return result.value;
  };

  if (data[LOCAL_KEYS.homework]) next[LOCAL_KEYS.homework] = take(remapHomework(data[LOCAL_KEYS.homework], map));
  for (const key of [LOCAL_KEYS.tests, LOCAL_KEYS.dictation]) {
    if (Array.isArray(data[key])) next[key] = take(remapSheets(data[key], map));
  }
  if (data[LOCAL_KEYS.groupLayout]) next[LOCAL_KEYS.groupLayout] = take(remapGroupLayout(data[LOCAL_KEYS.groupLayout], map));
  if (data[LOCAL_KEYS.seatingLayout]) next[LOCAL_KEYS.seatingLayout] = take(remapSeatingLayout(data[LOCAL_KEYS.seatingLayout], map));

  return { data: next, changed };
}

// 幂等：靠 meta 里的标记判断是否已迁移，重复调用不会产生副作用。
export function migrateStudentIds(map = legacyIdMap) {
  const meta = read(LOCAL_KEYS.meta, {}) || {};
  if (meta.studentIdSchema === STUDENT_ID_SCHEMA) return { migrated: false, changed: 0 };

  const { data, changed } = remapStudentIds(collectData(), map);
  for (const [key, value] of Object.entries(data)) write(key, value);
  write(LOCAL_KEYS.meta, { ...meta, studentIdSchema: STUDENT_ID_SCHEMA, studentIdMigratedAt: new Date().toISOString() });
  return { migrated: true, changed };
}
