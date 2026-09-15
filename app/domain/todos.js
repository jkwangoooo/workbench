// 每日待办领域逻辑（需求 §3 / §4.2）
//
// 存储形态：LOCAL_KEYS.todos 直接存数组，每条记录：
//   { id, content, plannedDate, status, completedAt, createdAt, updatedAt }
// - plannedDate 为 null 表示「待确认」（无日期）
// - status 只允许 'pending' | 'completed'
// - 不设优先级、分类、截止时间、附件、重复规则
//
// 旧形态兼容：{ id, text, due, done } 读取时自动转成新形态，
// 所以不需要一次迁移脚本（对齐 L1 违纪、L2 作业的设计选择）。

import { localDateStr, today } from '../core/date.js';

export const TODO_SCHEMA = 1;

/** 两周编辑窗口：今天起 14 个自然日（含今天）。 */
export const WINDOW_DAYS = 14;

/** 字段迁移：把旧形态 { text, due, done } 归一化成新形态。 */
export function normalizeTodo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  // 已经是新形态（有 status 字段）
  if (raw.status === 'pending' || raw.status === 'completed') {
    return {
      id: raw.id,
      content: raw.content ?? '',
      plannedDate: raw.plannedDate ?? null,
      status: raw.status,
      completedAt: raw.completedAt ?? null,
      createdAt: raw.createdAt ?? raw.updatedAt ?? null,
      updatedAt: raw.updatedAt ?? raw.createdAt ?? null
    };
  }
  // 旧形态：{ id, text, due, done }
  return {
    id: raw.id,
    content: raw.text ?? raw.content ?? '',
    plannedDate: raw.due ?? raw.plannedDate ?? null,
    status: raw.done === true ? 'completed' : 'pending',
    completedAt: raw.done === true ? (raw.completedAt ?? raw.updatedAt ?? null) : null,
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null
  };
}

/** 归一化整个待办数组：过滤无效项，逐条转新形态。 */
export function normalizeTodos(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeTodo).filter(Boolean);
}

/** 生成今天起 14 个自然日的日期数组（YYYY-MM-DD，本地时区）。 */
export function todoWindow(from = today) {
  const start = new Date(from + 'T00:00:00');
  const days = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(localDateStr(d));
  }
  return days;
}

/** 判断某待办是否已过期（计划日期早于今天，且未完成）。 */
export function isOverdue(todo, from = today) {
  if (!todo || todo.status !== 'pending') return false;
  if (!todo.plannedDate) return false; // 待确认不算逾期
  return todo.plannedDate < from;
}

/**
 * 逾期整理：把所有「计划日期早于今天且未完成」的待办移入待确认（清空 plannedDate）。
 * 纯函数，不改入参；幂等——已完成或已是待确认的不动。
 * 返回 { todos, moved }，moved 为本次移动的条数。
 */
export function sweepOverdue(raw, from = today) {
  const todos = normalizeTodos(raw);
  let moved = 0;
  const result = todos.map((todo) => {
    if (isOverdue(todo, from)) {
      moved += 1;
      return { ...todo, plannedDate: null, updatedAt: new Date().toISOString() };
    }
    return todo;
  });
  return { todos: result, moved };
}

/** 按日期分组：返回 Map<plannedDate|null, todo[]>，null 键表示待确认。 */
export function todosByDate(todos) {
  const map = new Map();
  for (const todo of todos) {
    const key = todo.plannedDate ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(todo);
  }
  return map;
}

/** 取某日期的待办（plannedDate 完全匹配），返回数组。 */
export function todosFor(todos, plannedDate) {
  return todos.filter((todo) => todo.plannedDate === plannedDate);
}

/** 取待确认（plannedDate 为 null）的待办。 */
export function pendingTodos(todos) {
  return todos.filter((todo) => todo.plannedDate === null);
}

/** 判断某个日期是否在两周编辑窗口内（含今天，共 14 天）。 */
export function inWindow(dateStr, from = today) {
  if (!dateStr) return false;
  const window = todoWindow(from);
  return window.includes(dateStr);
}
