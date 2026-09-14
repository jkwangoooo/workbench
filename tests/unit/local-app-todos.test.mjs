// 待办领域逻辑测试（需求 §3 / §4.2）
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  inWindow,
  isOverdue,
  normalizeTodo,
  normalizeTodos,
  pendingTodos,
  sweepOverdue,
  todoWindow,
  todosByDate,
  todosFor
} from '../../app/domain/todos.js';

const now = '2026-09-15T01:00:00.000Z';

function newTodo(over = {}) {
  return {
    id: 'todo-1',
    content: '改作业',
    plannedDate: '2026-09-16',
    status: 'pending',
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    ...over
  };
}

describe('待办领域逻辑', () => {
  it('normalizeTodo 把旧形态 {text,due,done} 转成新形态', () => {
    const legacy = { id: 't1', text: '改作业', due: '2026-09-15', done: true };
    const result = normalizeTodo(legacy);
    assert.equal(result.content, '改作业');
    assert.equal(result.plannedDate, '2026-09-15');
    assert.equal(result.status, 'completed');
    assert.equal(result.id, 't1');
  });

  it('normalizeTodo 对旧形态未完成（done=false）转 pending', () => {
    const legacy = { id: 't2', text: '备课', due: '2026-09-20', done: false };
    const result = normalizeTodo(legacy);
    assert.equal(result.status, 'pending');
    assert.equal(result.plannedDate, '2026-09-20');
  });

  it('normalizeTodo 对新形态原样保留', () => {
    const current = newTodo({ plannedDate: null });
    const result = normalizeTodo(current);
    assert.equal(result.status, 'pending');
    assert.equal(result.plannedDate, null);
    assert.equal(result.content, '改作业');
  });

  it('normalizeTodos 过滤无效项', () => {
    const result = normalizeTodos([newTodo(), null, 'bad', 42]);
    assert.equal(result.length, 1);
  });

  it('todoWindow 返回今天起 14 个自然日（含今天）', () => {
    const window = todoWindow('2026-09-15');
    assert.equal(window.length, 14);
    assert.equal(window[0], '2026-09-15'); // 今天
    assert.equal(window[13], '2026-09-28'); // 第 14 天
  });

  it('inWindow 正确判断 14 天窗口边界', () => {
    assert.ok(inWindow('2026-09-15', '2026-09-15')); // 今天
    assert.ok(inWindow('2026-09-28', '2026-09-15')); // 第 14 天
    assert.ok(!inWindow('2026-09-29', '2026-09-15')); // 第 15 天
    assert.ok(!inWindow('2026-09-14', '2026-09-15')); // 昨天
    assert.ok(!inWindow(null, '2026-09-15'));
  });

  it('isOverdue 只认未完成且计划日期早于今天', () => {
    assert.ok(isOverdue(newTodo({ plannedDate: '2026-09-14' }), '2026-09-15'));
    assert.ok(!isOverdue(newTodo({ plannedDate: '2026-09-15' }), '2026-09-15')); // 今天不算逾期
    assert.ok(!isOverdue(newTodo({ plannedDate: '2026-09-14', status: 'completed' }), '2026-09-15')); // 已完成不动
    assert.ok(!isOverdue(newTodo({ plannedDate: null }), '2026-09-15')); // 待确认不算逾期
  });

  it('sweepOverdue 把逾期未完成移入待确认，且幂等', () => {
    const input = [
      newTodo({ id: 'a', plannedDate: '2026-09-10', status: 'pending' }), // 逾期
      newTodo({ id: 'b', plannedDate: '2026-09-10', status: 'completed' }), // 已完成不动
      newTodo({ id: 'c', plannedDate: null, status: 'pending' }), // 已是待确认
      newTodo({ id: 'd', plannedDate: '2026-09-16', status: 'pending' }) // 未来不动
    ];
    const first = sweepOverdue(input, '2026-09-15');
    assert.equal(first.moved, 1);
    const a = first.todos.find((t) => t.id === 'a');
    assert.equal(a.plannedDate, null, '逾期项应清空 plannedDate');

    // 幂等：再跑一次不再移动
    const second = sweepOverdue(first.todos, '2026-09-15');
    assert.equal(second.moved, 0);
    assert.equal(second.todos.length, first.todos.length, '不产生重复条目');
  });

  it('todosByDate 按日期分组，null 键为待确认', () => {
    const todos = [
      newTodo({ id: 'a', plannedDate: '2026-09-16' }),
      newTodo({ id: 'b', plannedDate: '2026-09-16' }),
      newTodo({ id: 'c', plannedDate: null })
    ];
    const map = todosByDate(todos);
    assert.equal(map.get('2026-09-16').length, 2);
    assert.equal(map.get(null).length, 1);
  });

  it('todosFor 按日期精确筛选', () => {
    const todos = [newTodo({ id: 'a', plannedDate: '2026-09-16' }), newTodo({ id: 'b', plannedDate: null })];
    assert.equal(todosFor(todos, '2026-09-16').length, 1);
    assert.equal(todosFor(todos, '2026-09-17').length, 0, '不存在的日期返回空');
    assert.equal(todosFor(todos, null).length, 1, 'null 匹配待确认项');
  });

  it('pendingTodos 只取 plannedDate 为 null 的待办', () => {
    const todos = [newTodo({ id: 'a', plannedDate: null }), newTodo({ id: 'b', plannedDate: '2026-09-16' })];
    const pending = pendingTodos(todos);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].id, 'a');
  });
});
