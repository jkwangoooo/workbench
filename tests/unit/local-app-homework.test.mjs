import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  WORKBENCH_SEED: {
    classes: [
      {
        name: '2025级8班',
        students: [
          { name: '甲', sortOrder: 0, provincialStudentNumber: 'A1' },
          { name: '乙', sortOrder: 1, provincialStudentNumber: 'A2' },
          { name: '丙', sortOrder: 2, provincialStudentNumber: 'A3' }
        ]
      },
      {
        name: '2025级7班',
        students: [
          { name: '丁', sortOrder: 0, provincialStudentNumber: 'B1' },
          { name: '戊', sortOrder: 1, provincialStudentNumber: 'B2' }
        ]
      }
    ]
  }
};

const { roster7, roster8 } = await import('../../app/core/roster.js');
const { DEFAULT_RATING, HOMEWORK_RATINGS, buildContents, buildFeedback, feedbackCounts, feedbackFor, normalizeHomework, orphanFeedback, pendingContentChanges, pendingFeedbackChanges, planSave, tasksFor } =
  await import('../../app/domain/homework.js');

const [JIA, YI, BING] = roster8.map((student) => student.id);
const DAY = '2026-09-14';
const NOW = new Date('2026-09-14T12:00:00.000Z');

const empty = { tasks: [], feedback: [] };

// 一份「第 1 条作业已填、全班默认优」的数据，供多条用例复用。
function seeded(setup = {}) {
  return planSave(empty, {
    classNumber: '8',
    date: DAY,
    slot: 1,
    content: '第一课词语抄写',
    feedback: buildFeedback(roster8, new Map([[YI, { rating: '不交', note: '没带作业本' }]])),
    students: roster8,
    now: NOW,
    ...setup
  });
}

test('旧形态读出来是「孤立反馈」：没有作业内容可挂，但一条都不丢', () => {
  const data = normalizeHomework({ '8:2026-09-14': { [JIA]: { rating: '优', note: '' }, [YI]: { rating: '不交', note: '家长已知' } } });

  assert.equal(data.tasks.length, 0, '旧形态没有作业内容，不该凭空造一条作业');
  assert.equal(data.feedback.length, 2);
  assert.equal(data.feedback.every((row) => row.legacy === true), true);
  assert.equal(orphanFeedback(data.tasks, data.feedback).length, 2, '挂不上作业的反馈要能数出来给页面提示');
  assert.equal(data.feedback.find((row) => row.studentId === YI).note, '家长已知');
});

test('新形态归一化：按 (班级,日期,编号) 与 (作业,学生) 去重，id 稳定可推导', () => {
  const raw = {
    version: 2,
    tasks: [
      { classNumber: '8', homeworkDate: DAY, slot: 1, content: '旧内容', updatedAt: '2026-09-14T08:00:00.000Z' },
      { classNumber: '8', homeworkDate: DAY, slot: 1, content: '新内容', updatedAt: '2026-09-14T09:00:00.000Z' },
      { classNumber: '8', homeworkDate: DAY, slot: 4, content: '编号非法' },
      { classNumber: '8', homeworkDate: '九月十四', slot: 2, content: '日期非法' }
    ],
    feedback: [
      { homeworkId: 'h1', studentId: JIA, rating: '优', note: '' },
      { homeworkId: 'h1', studentId: JIA, rating: '差', note: '后来改的', updatedAt: '2026-09-14T10:00:00.000Z' },
      { homeworkId: 'h1', studentId: '不认识的学生', rating: '乱写', note: null }
    ]
  };
  const data = normalizeHomework(raw);
  const again = normalizeHomework(data);

  assert.equal(data.tasks.length, 1, '同一条作业只留一份，编号/日期非法的丢掉');
  assert.equal(data.tasks[0].content, '新内容', '留时间戳更新的那条');
  assert.equal(data.tasks[0].id, `homework-8-${DAY}-1`, 'id 由班级+日期+编号推导');
  assert.deepEqual(again, data, '再归一化一次结果不变（幂等）');

  assert.equal(data.feedback.length, 2);
  const jia = data.feedback.find((row) => row.studentId === JIA);
  assert.equal(jia.rating, '差', '同一元组留更新的那条');
  assert.equal(jia.note, '后来改的');
  assert.equal(data.feedback.find((row) => row.studentId === '不认识的学生').rating, DEFAULT_RATING, '状态不合法退回默认「优」，不静默变成别的');
  assert.equal(data.feedback.find((row) => row.studentId === '不认识的学生').note, '', 'note 恒为字符串，不用 null');
});

test('第一次保存一条作业：内容落盘，全班按默认「优」写入反馈', () => {
  const outcome = seeded();
  assert.deepEqual(outcome.problems, []);
  assert.equal(outcome.summary.initialized, true);
  assert.equal(outcome.tasks.length, 1);
  assert.equal(outcome.tasks[0].content, '第一课词语抄写');
  assert.equal(outcome.tasks[0].slot, 1);
  assert.equal(outcome.feedback.length, roster8.length, '全班每人都有一条反馈');
  assert.equal(outcome.feedback.filter((row) => row.rating === DEFAULT_RATING).length, roster8.length - 1);
  assert.equal(outcome.feedback.find((row) => row.studentId === YI).rating, '不交');
  assert.equal(outcome.feedback.find((row) => row.studentId === YI).note, '没带作业本');
  assert.equal(outcome.feedback.every((row) => row.homeworkId === outcome.tasks[0].id), true, '反馈都挂在同一条作业上');
});

test('再次保存读回已有记录：不重新初始化，也没动过的行不改时间戳', () => {
  const first = seeded();
  const kept = first.feedback.find((row) => row.studentId === JIA);
  const view = feedbackFor(first.feedback, first.tasks[0].id);
  const draft = buildFeedback(roster8, view);

  const second = planSave(first, {
    classNumber: '8',
    date: DAY,
    slot: 1,
    content: '第一课词语抄写',
    feedback: { ...draft, [BING]: { rating: '良', note: '字要写工整' } },
    students: roster8,
    now: new Date('2026-09-14T13:00:00.000Z')
  });

  assert.equal(second.summary.initialized, false, '已有记录就不该再初始化');
  assert.equal(second.summary.contentChanged, false);
  assert.equal(second.summary.feedbackChanged, 1, '只有真正改了的才算改动');
  assert.equal(second.feedback.length, roster8.length, '不会因为再存一次就多出记录');
  const untouched = second.feedback.find((row) => row.studentId === JIA);
  assert.equal(untouched.updatedAt, kept.updatedAt, '没动过的行保持原时间戳');
  assert.equal(second.feedback.find((row) => row.studentId === BING).rating, '良');
  assert.equal(second.feedback.find((row) => row.studentId === YI).note, '没带作业本', '别人的备注不受影响');
});

test('改作业内容不会重置学生反馈（需求 §4.4）', () => {
  const first = seeded();
  const yI = first.feedback.find((row) => row.studentId === YI);

  const second = planSave(first, {
    classNumber: '8',
    date: DAY,
    slot: 1,
    content: '第一课词语抄写（改成两遍）',
    feedback: buildFeedback(roster8, feedbackFor(first.feedback, first.tasks[0].id)),
    students: roster8,
    now: new Date('2026-09-14T14:00:00.000Z')
  });

  assert.equal(second.summary.contentChanged, true);
  assert.equal(second.summary.feedbackChanged, 0, '只改了内容，反馈不该算改动');
  assert.equal(second.feedback.find((row) => row.studentId === YI).rating, '不交', '「不交」没有被重置成「优」');
  assert.equal(second.feedback.find((row) => row.studentId === YI).updatedAt, yI.updatedAt);
});

test('三条作业互不影响：保存第 2 条不碰第 1 条、同日其他作业和其他班级', () => {
  const first = seeded();
  const seven = planSave(empty, {
    classNumber: '7',
    date: DAY,
    slot: 1,
    content: '7班的作业',
    feedback: buildFeedback(roster7),
    students: roster7,
    now: NOW
  });
  const before = { tasks: first.tasks.concat(seven.tasks), feedback: first.feedback.concat(seven.feedback) };
  const firstTask = before.tasks.find((task) => task.classNumber === '8' && task.slot === 1);
  const firstRow = before.feedback.find((row) => row.homeworkId === firstTask.id && row.studentId === YI);

  const second = planSave(before, {
    classNumber: '8',
    date: DAY,
    slot: 2,
    content: '第二课背诵',
    feedback: buildFeedback(roster8, new Map([[BING, { rating: '不交', note: '' }]])),
    students: roster8,
    now: new Date('2026-09-14T15:00:00.000Z')
  });

  const afterTask = second.tasks.find((task) => task.id === firstTask.id);
  const afterRow = second.feedback.find((row) => row.homeworkId === firstTask.id && row.studentId === YI);
  assert.equal(afterTask.content, '第一课词语抄写', '第 1 条作业内容一个字段都不该被第 2 条带着改');
  assert.deepEqual(afterRow, firstRow, '第 1 条的反馈原样不动');
  assert.equal(second.tasks.filter((task) => task.classNumber === '8' && task.homeworkDate === DAY).length, 2);
  assert.equal(seven.tasks.every((task) => second.tasks.some((item) => item.id === task.id)), true, '7 班的作业原样带走');
  assert.equal(second.feedback.filter((row) => row.homeworkId.startsWith('homework-7-')).length, roster7.length);
});

test('空作业不落盘：内容为空又没有已保存的作业时，什么都不改', () => {
  const outcome = planSave(empty, { classNumber: '8', date: DAY, slot: 3, content: '   ', feedback: {}, students: roster8, now: NOW });
  assert.deepEqual(outcome.problems, []);
  assert.equal(outcome.summary.contentChanged, false);
  assert.deepEqual(outcome.tasks, []);
  assert.deepEqual(outcome.feedback, []);
});

test('清空已有反馈的作业：先要二次确认并报出人数，确认后才连反馈一起删', () => {
  const first = seeded();
  const asked = planSave(first, { classNumber: '8', date: DAY, slot: 1, content: '', feedback: {}, students: roster8, now: NOW });

  assert.equal(asked.needsConfirm.feedbackCount, roster8.length);
  assert.equal(asked.needsConfirm.slot, 1);
  assert.deepEqual(asked.tasks, first.tasks, '没确认之前一个字段都不落盘');
  assert.deepEqual(asked.feedback, first.feedback);

  const deleted = planSave(first, { classNumber: '8', date: DAY, slot: 1, content: '', confirm: true });
  assert.equal(deleted.deleted.feedbackCount, roster8.length);
  assert.deepEqual(deleted.tasks, [], '这条作业被删掉');
  assert.deepEqual(deleted.feedback, [], '它的反馈级联删掉');
  assert.equal(deleted.needsConfirm, null);
});

test('清空没有反馈的作业只是普通保存：不弹确认，同日其他作业不受影响', () => {
  const first = seeded();
  const second = planSave(first, {
    classNumber: '8',
    date: DAY,
    slot: 2,
    content: '第二课背诵',
    feedback: buildFeedback(roster8),
    students: roster8,
    now: NOW
  });
  const both = { tasks: second.tasks, feedback: second.feedback };
  // 把第 2 条的学生反馈全删掉，模拟「有内容但一条反馈都没有」
  const orphaned = { tasks: both.tasks, feedback: both.feedback.filter((row) => row.homeworkId !== both.tasks.find((task) => task.slot === 2).id) };

  const outcome = planSave(orphaned, { classNumber: '8', date: DAY, slot: 2, content: '', feedback: {}, students: roster8, now: NOW });
  assert.equal(outcome.needsConfirm, null, '没有反馈就不该要二次确认');
  assert.equal(outcome.deleted.feedbackCount, 0);
  assert.equal(outcome.tasks.some((task) => task.slot === 2), false, '空作业被收掉');
  assert.equal(outcome.tasks.some((task) => task.slot === 1), true, '第 1 条作业原样留着');
  assert.equal(outcome.feedback.length, roster8.length, '第 1 条的反馈一条不少');
});

test('状态不在四档、或出现名单外的学生：整批不落盘并说清是谁', () => {
  const first = seeded();
  const view = feedbackFor(first.feedback, first.tasks[0].id);
  const draft = buildFeedback(roster8, view);

  const badRating = planSave(first, { classNumber: '8', date: DAY, slot: 1, content: '第一课词语抄写', feedback: { ...draft, [JIA]: { rating: '及格', note: '' } }, students: roster8, now: NOW });
  assert.equal(badRating.problems.length, 1);
  assert.match(badRating.problems[0].reason, /不交 \/ 优 \/ 良 \/ 差/);
  assert.deepEqual(badRating.tasks, first.tasks, '原样退回，等于没写');

  const stranger = planSave(first, { classNumber: '8', date: DAY, slot: 1, content: '第一课词语抄写', feedback: { ...draft, 'local-7-nobody': { rating: '优', note: '' } }, students: roster8, now: NOW });
  assert.equal(stranger.problems.length, 1);
  assert.match(stranger.problems[0].reason, /不在当前班级名单里/);

  const badDate = planSave(first, { classNumber: '8', date: '', slot: 1, content: '随便', feedback: draft, students: roster8, now: NOW });
  assert.match(badDate.problems[0].reason, /不是 YYYY-MM-DD/);

  const badSlot = planSave(first, { classNumber: '8', date: DAY, slot: 9, content: '随便', feedback: draft, students: roster8, now: NOW });
  assert.match(badSlot.problems[0].reason, /只能填 1 \/ 2 \/ 3|只能是 1 \/ 2 \/ 3/);
});

test('草稿默认「优」，未保存差异只算真正变了的', () => {
  const first = seeded();
  const bySlot = tasksFor(first.tasks, '8', DAY);
  const view = feedbackFor(first.feedback, bySlot.get(1).id);
  const draft = buildFeedback(roster8, view);

  assert.equal(draft[JIA].rating, DEFAULT_RATING);
  assert.equal(draft[YI].rating, '不交');
  assert.deepEqual(pendingFeedbackChanges(roster8, view, draft), [], '读回来的和已保存的一样，就不算改动');
  assert.deepEqual(pendingFeedbackChanges(roster8, view, { ...draft, [JIA]: { rating: '良', note: '' } }), [JIA]);
  assert.deepEqual(pendingFeedbackChanges(roster8, view, { ...draft, [YI]: { rating: '不交', note: '  补一句  ' } }), [YI], '备注去掉首尾空白后一样就算没改');

  const contents = buildContents(bySlot);
  assert.equal(contents[1], '第一课词语抄写');
  assert.equal(contents[2], '');
  assert.deepEqual(pendingContentChanges(bySlot, contents), []);
  assert.deepEqual(pendingContentChanges(bySlot, { ...contents, 2: '第二课背诵' }), [2]);
  assert.deepEqual(pendingContentChanges(bySlot, { ...contents, 1: '  第一课词语抄写  ' }), [], '只加空白不算改动');
});

test('反馈条数按作业统计，供页面显示「已有反馈 N 人」', () => {
  const first = seeded();
  const counts = feedbackCounts(first.feedback);
  assert.equal(counts.get(first.tasks[0].id), roster8.length);
  assert.equal(counts.get('不存在的作业'), undefined);
  assert.equal(HOMEWORK_RATINGS.join(''), '不交优良差');
});
