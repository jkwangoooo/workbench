// 作业反馈（需求 §4）：7 班和 8 班，每天固定第 1 / 2 / 3 条作业，三条各自独立。
// 一条作业 + 它的全班反馈算一个「作业域」，保存时内容和反馈一起提交（需求 §4.6）。
//
// 存储形态是一个 localStorage 键里的两张表，对应需求 §6.2 的 daily_homework 与 §6.3 的 homework_feedback：
//   { version: 2,
//     tasks:    [ { id, classNumber, homeworkDate, slot, content, createdAt, updatedAt } ],
//     feedback: [ { id, homeworkId, studentId, rating, note, createdAt, updatedAt } ] }
//
// id 由 (班级, 日期, 编号) 和 (作业, 学生) 直接推导，没有走 uid()：
// 这两个元组本来就是要落在唯一约束上的键，确定性 id 让读取归一化天然幂等，
// 也不会因为重复渲染、重复归一化造出幽灵记录。
//
// 更早的版本只存反馈、不存作业内容，形态是两层键 `班级:日期` → 学生 ID → { rating, note }。
// 读取时能认出来，但没有内容就没有作业域可挂，于是保留为「孤立反馈」
// —— 与违纪里认不出学生的记录同一条原则：宁可留着也不丢数据。页面会显式提示条数。

export const HOMEWORK_SCHEMA = 2;
export const HOMEWORK_SLOTS = [1, 2, 3];
export const HOMEWORK_RATINGS = ['不交', '优', '良', '差'];
export const DEFAULT_RATING = '优';
export const HOMEWORK_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LEGACY_TASK_PREFIX = 'legacy-homework:';

const text = (value) => String(value ?? '').trim();
const stampOf = (entry) => text(entry?.updatedAt) || text(entry?.createdAt);

export const normalizeClass = (value) => (String(value) === '7' ? '7' : '8');
export const isSlot = (value) => HOMEWORK_SLOTS.includes(Number(value));
export const ratingOf = (value) => (HOMEWORK_RATINGS.includes(text(value)) ? text(value) : DEFAULT_RATING);

export const taskIdOf = (classNumber, date, slot) => `homework-${normalizeClass(classNumber)}-${date}-${slot}`;
export const feedbackIdOf = (homeworkId, studentId) => `${homeworkId}|${studentId}`;

export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const slot = Number(raw.slot);
  if (!HOMEWORK_SLOTS.includes(slot)) return null;
  const classNumber = normalizeClass(raw.classNumber);
  const homeworkDate = text(raw.homeworkDate || raw.date);
  if (!HOMEWORK_DATE_RE.test(homeworkDate)) return null;
  const createdAt = text(raw.createdAt);
  return {
    id: text(raw.id) || taskIdOf(classNumber, homeworkDate, slot),
    classNumber,
    homeworkDate,
    slot,
    content: text(raw.content),
    createdAt,
    updatedAt: text(raw.updatedAt) || createdAt
  };
}

function normalizeFeedbackRow(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const homeworkId = text(raw.homeworkId);
  const studentId = text(raw.studentId);
  if (!homeworkId || !studentId) return null;
  const createdAt = text(raw.createdAt);
  return {
    id: text(raw.id) || feedbackIdOf(homeworkId, studentId),
    homeworkId,
    studentId,
    rating: ratingOf(raw.rating),
    note: text(raw.note),
    createdAt,
    updatedAt: text(raw.updatedAt) || createdAt
  };
}

// 同一元组出现多条只可能是手工改过存储：留时间戳更新（一样新就留内容更长的）那条，不静默取头一条。
function preferNewer(first, second, lengthOf) {
  const a = stampOf(first);
  const b = stampOf(second);
  if (b !== a) return b > a ? second : first;
  return lengthOf(second) > lengthOf(first) ? second : first;
}

export function isHomeworkV2(raw) {
  return Boolean(raw) && typeof raw === 'object' && (raw.version === HOMEWORK_SCHEMA || Array.isArray(raw.tasks) || Array.isArray(raw.feedback));
}

// 旧形态：`班级:日期` → 学生 ID → { rating, note }，没有作业内容。
function legacyFeedback(raw) {
  const rows = [];
  for (const [groupKey, group] of Object.entries(raw)) {
    const cut = groupKey.indexOf(':');
    if (cut <= 0 || !group || typeof group !== 'object') continue;
    const classNumber = normalizeClass(groupKey.slice(0, cut));
    const date = groupKey.slice(cut + 1);
    if (!HOMEWORK_DATE_RE.test(date)) continue;
    const homeworkId = `${LEGACY_TASK_PREFIX}${classNumber}:${date}:1`;
    for (const [studentId, entry] of Object.entries(group)) {
      if (!entry || typeof entry !== 'object') continue;
      rows.push({
        id: feedbackIdOf(homeworkId, studentId),
        homeworkId,
        studentId: text(studentId),
        rating: ratingOf(entry.rating),
        note: text(entry.note),
        createdAt: '',
        updatedAt: '',
        legacy: true
      });
    }
  }
  return rows;
}

export function normalizeHomework(raw) {
  if (!raw || typeof raw !== 'object') return { tasks: [], feedback: [] };

  if (!isHomeworkV2(raw)) return { tasks: [], feedback: legacyFeedback(raw) };

  const tasks = new Map();
  for (const item of Array.isArray(raw.tasks) ? raw.tasks : []) {
    const task = normalizeTask(item);
    if (!task) continue;
    const key = `${task.classNumber}|${task.homeworkDate}|${task.slot}`;
    const before = tasks.get(key);
    tasks.set(key, before ? preferNewer(before, task, (entry) => entry.content.length) : task);
  }

  const feedback = new Map();
  for (const item of Array.isArray(raw.feedback) ? raw.feedback : []) {
    const row = normalizeFeedbackRow(item);
    if (!row) continue;
    const key = `${row.homeworkId}|${row.studentId}`;
    const before = feedback.get(key);
    feedback.set(key, before ? preferNewer(before, row, (entry) => entry.note.length) : row);
  }

  return { tasks: [...tasks.values()], feedback: [...feedback.values()] };
}

// 某班某天的三条作业：编号 → 作业。班级和日期都是必带条件（需求 §4.4）。
export function tasksFor(tasks, classNumber, date) {
  const map = new Map();
  const wanted = normalizeClass(classNumber);
  for (const task of tasks) if (task.classNumber === wanted && task.homeworkDate === date) map.set(task.slot, task);
  return map;
}

export function feedbackFor(feedback, homeworkId) {
  const map = new Map();
  for (const row of feedback) if (row.homeworkId === homeworkId) map.set(row.studentId, row);
  return map;
}

export function feedbackCounts(feedback) {
  const counts = new Map();
  for (const row of feedback) counts.set(row.homeworkId, (counts.get(row.homeworkId) || 0) + 1);
  return counts;
}

// 挂不到任何作业上的反馈（只可能来自旧版本：那时候有反馈、没作业内容）。
export function orphanFeedback(tasks, feedback) {
  const ids = new Set(tasks.map((task) => task.id));
  return feedback.filter((row) => !ids.has(row.homeworkId));
}

// 内容草稿：三条作业各自的当前文字，已保存的原样带入，其余为空。
export function buildContents(tasksBySlot) {
  const contents = {};
  for (const slot of HOMEWORK_SLOTS) contents[slot] = tasksBySlot.get(slot)?.content || '';
  return contents;
}

export const ratingEntry = (saved) => ({ rating: ratingOf(saved?.rating), note: text(saved?.note) });

// 反馈草稿：全班每人一条，没记录过的默认「优」、备注为空（需求 §4.2 / §4.3）。
export function buildFeedback(students, savedByStudent = new Map()) {
  const draft = {};
  for (const student of students) draft[student.id] = ratingEntry(savedByStudent.get(student.id));
  return draft;
}

// 三条作业的内容与已保存内容的差异（去首尾空白后比较）。
export function pendingContentChanges(tasksBySlot, contents) {
  return HOMEWORK_SLOTS.filter((slot) => text(contents?.[slot]) !== (tasksBySlot.get(slot)?.content || ''));
}

// 当前这条作业的学生反馈差异：只算真正变了的，默认「优」不算改动。
export function pendingFeedbackChanges(students, savedByStudent, draft) {
  return students
    .filter((student) => {
      const before = ratingEntry(savedByStudent.get(student.id));
      const next = ratingEntry(draft?.[student.id]);
      return before.rating !== next.rating || before.note !== next.note;
    })
    .map((student) => student.id);
}

// 保存一个作业域：内容 + 该条作业的学生反馈一起提交，纯函数，不改入参。
// 返回下一版整份数据、本次改动摘要，以及两种「要先问一句」的情况：
//   needsConfirm —— 清空了一条已有反馈的作业，需要二次确认后带 confirm 再调一次（需求 §4.5）；
//   problems     —— 校验不过，调用方必须整批不落盘、保留草稿并说明原因（需求 §4.6）。
// summary.initialized 为真表示这是第一次保存这条作业，全班会按默认「优」写入（需求 §4.2）。
export function planSave(all, options = {}) {
  const tasks = Array.isArray(all?.tasks) ? all.tasks : [];
  const feedback = Array.isArray(all?.feedback) ? all.feedback : [];
  const idle = {
    tasks,
    feedback,
    problems: [],
    needsConfirm: null,
    deleted: null,
    summary: { contentChanged: false, feedbackChanged: 0, initialized: false }
  };

  const { classNumber, date, slot, content = '', feedback: draft = null, students = [], now = new Date(), confirm = false } = options;
  const problems = [];
  if (!HOMEWORK_DATE_RE.test(String(date || ''))) problems.push({ name: '日期', reason: `日期「${date || '空'}」不是 YYYY-MM-DD，本次未保存` });
  const number = Number(slot);
  if (!HOMEWORK_SLOTS.includes(number)) problems.push({ name: '作业编号', reason: `第 ${slot} 条不存在，作业编号只能是 1 / 2 / 3，本次未保存` });
  if (!['7', '8'].includes(String(classNumber))) problems.push({ name: '班级', reason: `班级「${classNumber}」不是 7 班或 8 班，本次未保存` });
  if (problems.length) return { ...idle, problems };

  const cls = normalizeClass(classNumber);
  const task = tasksFor(tasks, cls, date).get(number) || null;
  const savedRows = task ? feedbackFor(feedback, task.id) : new Map();
  const nextContent = text(content);

  // 内容清空 = 删除这条作业。有反馈就先要二次确认；没有反馈只是普通保存（需求 §4.5）。
  if (!nextContent) {
    if (!task) return idle;
    if (savedRows.size && !confirm) return { ...idle, needsConfirm: { slot: number, feedbackCount: savedRows.size } };
    return {
      tasks: tasks.filter((item) => item.id !== task.id),
      feedback: feedback.filter((item) => item.homeworkId !== task.id),
      problems: [],
      needsConfirm: null,
      deleted: { slot: number, feedbackCount: savedRows.size },
      summary: { contentChanged: true, feedbackChanged: savedRows.size, initialized: false }
    };
  }

  // 反馈状态只认四档，学生只认本班名单；有一条不对就整批不落盘。
  const roster = new Map(students.map((student) => [student.id, student]));
  for (const [studentId, entry] of Object.entries(draft || {})) {
    const student = roster.get(studentId);
    if (!student) {
      problems.push({ name: studentId, reason: '不在当前班级名单里，本次未保存' });
      continue;
    }
    const rating = text(entry?.rating);
    if (rating && !HOMEWORK_RATINGS.includes(rating))
      problems.push({ name: student.name, reason: `状态「${rating}」不在「不交 / 优 / 良 / 差」里，本次未保存` });
  }
  if (problems.length) return { ...idle, problems };

  const stamp = now.toISOString();
  const nextTask = task
    ? { ...task, content: nextContent, updatedAt: stamp }
    : {
        id: taskIdOf(cls, date, number),
        classNumber: cls,
        homeworkDate: date,
        slot: number,
        content: nextContent,
        createdAt: stamp,
        updatedAt: stamp
      };

  const initialize = !task || !savedRows.size;
  const fresh = [];
  let feedbackChanged = 0;
  for (const student of students) {
    const entry = draft?.[student.id];
    const before = savedRows.get(student.id) || null;
    if (!entry) {
      if (before) fresh.push(before); // 草稿里没这名学生（理论上不会），原样保留
      continue;
    }
    const rating = ratingOf(entry.rating);
    const note = text(entry.note);
    if (!before) {
      fresh.push({
        id: feedbackIdOf(nextTask.id, student.id),
        homeworkId: nextTask.id,
        studentId: student.id,
        rating,
        note,
        createdAt: stamp,
        updatedAt: stamp
      });
      feedbackChanged += 1;
      continue;
    }
    if (before.rating === rating && before.note === note) {
      fresh.push(before); // 没动过的不改时间戳
      continue;
    }
    fresh.push({ ...before, rating, note, updatedAt: stamp });
    feedbackChanged += 1;
  }
  // 名单里已经没有、但当时确实记过的反馈原样带走：改名单不该顺手删数据。
  for (const [studentId, row] of savedRows) if (!roster.has(studentId)) fresh.push(row);

  return {
    tasks: task ? tasks.map((item) => (item.id === nextTask.id ? nextTask : item)) : tasks.concat([nextTask]),
    feedback: feedback.filter((item) => item.homeworkId !== nextTask.id).concat(fresh),
    problems: [],
    needsConfirm: null,
    deleted: null,
    summary: { contentChanged: !task || task.content !== nextContent, feedbackChanged, initialized: initialize }
  };
}
