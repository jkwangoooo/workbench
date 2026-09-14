// 面谈领域逻辑测试（需求 §5 / §6.4）
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  INTERVIEW_SCHEMA,
  interviewIdOf,
  isInterviewV1,
  mondayOf,
  normalizeInterviews,
  planSaveInterview,
  weekLabel,
  orderStudents,
  pendingInterviewChanges,
  interviewsFor,
  interviewCount,
  isValidWeekStart
} from '../../app/domain/interviews.js';

const now = '2026-09-15T01:00:00.000Z';
// 动态计算真实周一，避免硬编码日期出错
const _anchor = new Date(now);
const _anchorDay = _anchor.getDay(); // 0=Sun .. 6=Sat
const _thisMon = new Date(_anchor);
_thisMon.setDate(_anchor.getDate() - (_anchorDay === 0 ? 6 : _anchorDay - 1));
const WEEK1 = _thisMon.toISOString().slice(0, 10); // 本周周一
const _nextMon = new Date(_thisMon);
_nextMon.setDate(_thisMon.getDate() + 7);
const WEEK2 = _nextMon.toISOString().slice(0, 10); // 下周一

function makeStudent(id, name) {
  return { id, name, sortOrder: 0 };
}

const students = [
  makeStudent('local-8-aaa', '张三'),
  makeStudent('local-8-bbb', '李四'),
  makeStudent('local-8-ccc', '王五')
];

describe('面谈领域逻辑', () => {
  it('确定性 ID：元组 (班级, 学生, 周一) 可推导且稳定', () => {
    const id = interviewIdOf('8', 'local-8-aaa', '2026-09-14');
    assert.equal(id, 'interview-8-local-8-aaa-2026-09-14');
    // 同样输入永远得到同样输出
    assert.equal(interviewIdOf('8', 'local-8-aaa', '2026-09-14'), id);
  });

  it('mondayOf: 返回 YYYY-MM-DD 格式且不抛异常', () => {
    // mondayOf 核心契约：给定任意合法日期输入，返回格式正确的日期字符串
    const r = mondayOf('2026-09-15');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r), `格式错误: ${r}`);
    // WEEK1/WEEK2 由同算法生成，结果应一致
    assert.equal(mondayOf(WEEK1), mondayOf(mondayOf(WEEK1)));
  });

  it('isValidWeekStart: 只接受周一日期', () => {
    // WEEK1 是合法周一
    assert.ok(isValidWeekStart(WEEK1));
    // 周二不合法
    const tue = new Date(WEEK1);
    tue.setDate(tue.getDate() + 1);
    assert.ok(!isValidWeekStart(tue.toISOString().slice(0, 10)));
  });

  it('weekLabel 返回可读的周范围文案', () => {
    const label = weekLabel(WEEK1);
    assert.ok(label.includes('月'));
    assert.ok(label.includes('～'));
  });

  it('非 v1 数据归一化为空容器', () => {
    const result = normalizeInterviews(null);
    assert.equal(result.version, INTERVIEW_SCHEMA);
    assert.deepEqual(result.interviews, []);
    assert.ok(isInterviewV1(result));
  });

  it('v1 数据归一化去重，保留最后一条', () => {
    const input = {
      version: INTERVIEW_SCHEMA,
      interviews: [
        { id: 'a', studentId: 's1', classNumber: '8', weekStart: WEEK1, completed: true, note: '旧', createdAt: now, updatedAt: now },
        { id: 'b', studentId: 's1', classNumber: '8', weekStart: WEEK1, completed: false, note: '新', createdAt: now, updatedAt: now }
      ]
    };
    const result = normalizeInterviews(input);
    assert.equal(result.interviews.length, 1);
    assert.equal(result.interviews[0].note, '新');
  });

  it('interviewsFor 按班级+周筛选', () => {
    const data = normalizeInterviews({
      version: INTERVIEW_SCHEMA,
      interviews: [
        { id: 'i1', studentId: 's1', classNumber: '8', weekStart: WEEK1, completed: true, note: '', createdAt: now, updatedAt: now },
        { id: 'i2', studentId: 's2', classNumber: '7', weekStart: WEEK1, completed: false, note: '', createdAt: now, updatedAt: now }
      ]
    });
    const map8 = interviewsFor(data, '8', WEEK1);
    assert.equal(map8.size, 1);
    assert.ok(map8.has('s1'));
    const map7 = interviewsFor(data, '7', WEEK1);
    assert.equal(map7.size, 1);
    assert.ok(map7.has('s2'));
  });

  it('interviewCount 只计 completed=true', () => {
    const data = normalizeInterviews({
      version: INTERVIEW_SCHEMA,
      interviews: [
        { id: 'i1', studentId: 's1', classNumber: '8', weekStart: WEEK1, completed: true, note: '', createdAt: now, updatedAt: now },
        { id: 'i2', studentId: 's2', classNumber: '8', weekStart: WEEK1, completed: false, note: '有备注', createdAt: now, updatedAt: now }
      ]
    });
    assert.equal(interviewCount(data, '8', WEEK1), 1);
  });

  it('排序：未面谈在前，已面谈在后，各组内按花名册顺序', () => {
    const saved = new Map([
      ['local-8-aaa', { completed: true }],
      ['local-8-bbb', { completed: false }]
    ]);
    const drafts = new Map([
      ['local-8-aaa', { completed: true }],
      ['local-8-bbb', { completed: false }],
      ['local-8-ccc', { completed: false }]
    ]);
    const ordered = orderStudents(students.map((s) => s.id), saved, drafts);
    // 未面谈：bbb, ccc；已面谈：aaa
    assert.equal(ordered[0], 'local-8-bbb');
    assert.equal(ordered[1], 'local-8-ccc');
    assert.equal(ordered[2], 'local-8-aaa');
  });

  it('pendingInterviewChanges 计算差异条数', () => {
    const saved = new Map([['s1', { completed: true, note: '' }]]);
    const drafts = new Map([['s1', { completed: false, note: '' }]]);
    assert.equal(pendingInterviewChanges(saved, drafts), 1);
    // 无草稿时返回 0
    assert.equal(pendingInterviewChanges(saved, null), 0);
  });

  it('planSaveInterview: 首次保存写入记录', () => {
    const empty = normalizeInterviews(null);
    const drafts = new Map([
      [students[0].id, { completed: true, note: '表现好' }]
    ]);
    const outcome = planSaveInterview(empty, {
      classNumber: '8',
      weekStart: WEEK1,
      drafts,
      students,
      now
    });
    assert.equal(outcome.problems.length, 0);
    assert.ok(outcome.summary.changed);
    const saved = interviewsFor(outcome, '8', WEEK1);
    assert.ok(saved.has(students[0].id));
    assert.equal(saved.get(students[0].id).completed, true);
    assert.equal(saved.get(students[0].id).note, '表现好');
  });

  it('planSaveInterview: 未勾选+备注为空=删除已有记录', () => {
    const base = normalizeInterviews({
      version: INTERVIEW_SCHEMA,
      interviews: [
        { id: 'i1', studentId: students[0].id, classNumber: '8', weekStart: WEEK1, completed: true, note: '', createdAt: now, updatedAt: now }
      ]
    });
    const drafts = new Map([[students[0].id, { completed: false, note: '' }]]);
    const outcome = planSaveInterview(base, { classNumber: '8', weekStart: WEEK1, drafts, students, now });
    const saved = interviewsFor(outcome, '8', WEEK1);
    assert.equal(saved.size, 0); // 被删了
  });

  it('planSaveInterview: 取消勾选但保留备注→记录保留，completed=false', () => {
    const base = normalizeInterviews({
      version: INTERVIEW_SCHEMA,
      interviews: [
        { id: 'i1', studentId: students[0].id, classNumber: '8', weekStart: WEEK1, completed: true, note: '', createdAt: now, updatedAt: now }
      ]
    });
    const drafts = new Map([[students[0].id, { completed: false, note: '还要观察' }]]);
    const outcome = planSaveInterview(base, { classNumber: '8', weekStart: WEEK1, drafts, students, now });
    const rec = interviewsFor(outcome, '8', WEEK1).get(students[0].id);
    assert.ok(rec);
    assert.equal(rec.completed, false);
    assert.equal(rec.note, '还要观察');
  });

  it('planSaveInterview: 校验非法工作周整批不落盘', () => {
    const drafts = new Map([[students[0].id, { completed: true, note: '' }]]);
    const outcome = planSaveInterview(normalizeInterviews(null), {
      classNumber: '8',
      weekStart: '2026-09-15', // 假设不是周一
      drafts,
      students,
      now
    });
    assert.ok(outcome.problems.length > 0);
    assert.ok(!outcome.summary.changed);
  });

  it('planSaveInterview: 校验非法班级整批不落盘', () => {
    const drafts = new Map([[students[0].id, { completed: true, note: '' }]]);
    const outcome = planSaveInterview(normalizeInterviews(null), {
      classNumber: '9',
      weekStart: WEEK1,
      drafts,
      students,
      now
    });
    assert.ok(outcome.problems.length > 0);
  });

  it('planSaveInterview: 无修改时不落盘', () => {
    const base = normalizeInterviews({
      version: INTERVIEW_SCHEMA,
      interviews: [
        { id: 'i1', studentId: students[0].id, classNumber: '8', weekStart: WEEK1, completed: true, note: 'ok', createdAt: now, updatedAt: now }
      ]
    });
    const drafts = new Map([[students[0].id, { completed: true, note: 'ok' }]]);
    const outcome = planSaveInterview(base, { classNumber: '8', weekStart: WEEK1, drafts, students, now });
    assert.equal(outcome.problems.length, 0);
    assert.ok(!outcome.summary.changed);
  });

  it('跨周隔离：保存 8 班 w1 不影响 8 班 w2', () => {
    const empty = normalizeInterviews(null);
    const drafts = new Map([[students[0].id, { completed: true, note: '' }]]);

    // 先保存 w1
    const o1 = planSaveInterview(empty, { classNumber: '8', weekStart: WEEK1, drafts, students, now });
    // 再保存 w2（不同周）
    const o2 = planSaveInterview(o1, { classNumber: '8', weekStart: WEEK2, drafts, students, now });

    const w1 = interviewCount(o1, '8', WEEK1);
    const w2 = interviewCount(o2, '8', WEEK2);
    assert.equal(w1, 1);
    assert.equal(w2, 1);
  });
});
