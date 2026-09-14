// 面谈领域逻辑（需求 §5 / §6.4）
//
// 存储形态 v1：{ version: 1, interviews: [...] }
// 每条记录：{ id, studentId, classNumber, weekStart, completed, note, createdAt, updatedAt }
// 确定性 ID：interview-${classNumber}-${studentId}-${weekStart}

import { uid } from '../core/storage.js';

export const INTERVIEW_SCHEMA = 1;

/** 确定性 ID：元组 (班级, 学生, 周一日期) 本身就是唯一约束键。 */
export function interviewIdOf(classNumber, studentId, weekStart) {
  return `interview-${classNumber}-${studentId}-${weekStart}`;
}

/** 给定任意日期，返回所在周的周一日期（YYYY-MM-DD，本地时区）。 */
export function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const offset = day === 0 ? -6 : 1 - day; // Sun→回退6天到周一，其他→回退到周一
  d.setDate(d.getDate() + offset);
  // 用本地时区格式化，避免 toISOString() 返回 UTC 日期导致跨日不一致
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** 周一日期是否合法（必须是周一）。 */
export function isValidWeekStart(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 1;
}

/** 格式化工作周显示文案，如「9月14日周一 ～ 9月18日周五」。 */
export function weekLabel(weekStart) {
  const mon = new Date(weekStart + 'T00:00:00');
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4); // 周五
  const fmt = (d) => `${d.getMonth() + 1}月${d.getDate()}日${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}`;
  return `${fmt(mon)} ～ ${fmt(fri)}`;
}

/** 归一化原始存储数据。非 v1 或 null 返回空 v1 容器。 */
export function normalizeInterviews(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== INTERVIEW_SCHEMA) {
    return { version: INTERVIEW_SCHEMA, interviews: [] };
  }
  // 按 (classNumber, studentId, weekStart) 去重，保留最后一条
  const seen = new Set();
  const deduped = [];
  for (const rec of (raw.interviews || []).reverse()) {
    const key = `${rec.classNumber}:${rec.studentId}:${rec.weekStart}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.unshift(rec);
    }
  }
  return { version: INTERVIEW_SCHEMA, interviews: deduped };
}

/** 取某班某周的全部面谈记录，返回 Map<studentId, record>。 */
export function interviewsFor(normalized, classNumber, weekStart) {
  const map = new Map();
  for (const rec of normalized.interviews) {
    if (rec.classNumber === classNumber && rec.weekStart === weekStart) {
      map.set(rec.studentId, rec);
    }
  }
  return map;
}

/** 统计某班某周已面谈人数（completed === true）。 */
export function interviewCount(normalized, classNumber, weekStart) {
  let count = 0;
  for (const rec of normalized.interviews) {
    if (rec.classNumber === classNumber && rec.weekStart === weekStart && rec.completed) count += 1;
  }
  return count;
}

/**
 * 排序：未面谈学生在前（按花名册顺序），已面谈学生在后（也按花名册顺序）。
 * @param {string[]} rosterOrder 花名册顺序的学生 ID 数组
 * @param {Map<string, object>} saved 已保存记录 Map<studentId, record>
 * @param {Object} drafts 当前草稿 Map<studentId, {completed, note}>
 * @returns {string[]} 排序后的学生 ID 数组
 */
export function orderStudents(rosterOrder, saved, drafts) {
  const rank = new Map(rosterOrder.map((id, i) => [id, i]));

  const cmp = (a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999);

  const uninterviewed = [];
  const interviewed = [];

  for (const studentId of rosterOrder) {
    const draft = drafts?.get(studentId);
    const savedRec = saved.get(studentId);
    // 判定"已面谈"：草稿优先（正在编辑），其次看已保存
    const completed = draft ? draft.completed : savedRec?.completed === true;
    (completed ? interviewed : uninterviewed).push(studentId);
  }

  uninterviewed.sort(cmp);
  interviewed.sort(cmp);
  return [...uninterviewed, ...interviewed];
}

/**
 * 计算未保存差异条数。
 * @param {Map<string, object>} saved 已保存 Map<studentId, {completed, note}>
 * @param {Map<string, object>|null} drafts 当前草稿，null 表示无草稿
 * @returns {number} 差异条数
 */
export function pendingInterviewChanges(saved, drafts) {
  if (!drafts) return 0;
  let count = 0;
  for (const [studentId, draft] of drafts) {
    const rec = saved.get(studentId);
    const wasCompleted = rec?.completed === true;
    const wasNote = rec?.note || '';
    if (draft.completed !== wasCompleted || draft.note !== wasNote) count += 1;
  }
  return count;
}

/**
 * 纯函数事务：计算保存结果，不改入参。
 *
 * 返回 { interviews, problems, deleted, summary }：
 * - interviews: 保存后的完整数组（含新时间戳）
 * - problems: 校验不通过列表 [{ studentId?, name, reason }]
 * - deleted: 是否有记录被删除（用于 toast）
 * - summary: { changed, initialized } 变更摘要
 *
 * 规则（对齐 §5.4）：
 * - 未勾选且备注为空 → 不写入（或删除已有记录）
 * - 已勾选或备注非空 → 写入/更新一条记录
 * - 取消勾选但保留备注 → 记录保留，completed=false
 */
export function planSaveInterview(all, { classNumber, weekStart, drafts, students, now }) {
  const base = all.interviews;
  const problems = [];
  const studentSet = new Set(students.map((s) => s.id));

  // 校验：drafts 里的学生必须在名单内
  if (drafts) {
    for (const studentId of drafts.keys()) {
      if (!studentSet.has(studentId)) {
        problems.push({ studentId, name: studentId, reason: `学生 ${studentId} 不在当前班级名单内` });
      }
    }
  }

  // 校验：weekStart 必须是合法周一
  if (!isValidWeekStart(weekStart)) {
    problems.push({ name: '工作周', reason: `工作周起始日期 ${weekStart} 不是周一` });
  }

  // 校验：classNumber 必须是 7 或 8
  if (!['7', '8'].includes(String(classNumber))) {
    problems.push({ name: '班级', reason: `班级编号 ${classNumber} 不合法` });
  }

  if (problems.length) {
    return { interviews: base, problems, deleted: false, summary: { changed: false, initialized: false } };
  }

  // 过滤掉当前班级+当前周以外的旧记录（不动它们）
  const kept = base.filter((r) => !(r.classNumber === classNumber && r.weekStart === weekStart));

  const updated = [];
  let changed = false;

  if (drafts) {
    for (const [studentId, draft] of drafts) {
      const hasContent = draft.completed || (draft.note || '').trim();
      if (!hasContent) {
        // 未勾选+备注为空 → 删除（不写入）
        const existed = base.find((r) => r.studentId === studentId && r.classNumber === classNumber && r.weekStart === weekStart);
        if (existed) changed = true;
        continue;
      }

      const existing = base.find((r) => r.studentId === studentId && r.classNumber === classNumber && r.weekStart === weekStart);
      const rec = existing || {
        id: interviewIdOf(classNumber, studentId, weekStart),
        studentId,
        classNumber,
        weekStart,
        createdAt: now
      };

      const newCompleted = draft.completed;
      const newNote = (draft.note || '').trim();

      if (!existing) {
        changed = true;
      } else if (existing.completed !== newCompleted || existing.note !== newNote) {
        changed = true;
      }

      updated.push({
        ...rec,
        completed: newCompleted,
        note: newNote,
        updatedAt: now
      });
    }
  }

  const result = [...kept, ...updated];

  return {
    interviews: result,
    problems: [],
    deleted: updated.length < kept.length - base.length + updated.length, // 有删减
    summary: { changed }
  };
}

/** 判断原始数据是否已是 v1 面谈形态。 */
export function isInterviewV1(raw) {
  return raw && typeof raw === 'object' && raw.version === INTERVIEW_SCHEMA && Array.isArray(raw.interviews);
}
