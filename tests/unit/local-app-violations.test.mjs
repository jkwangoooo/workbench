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
      { name: '2025级7班', students: [{ name: '丁', sortOrder: 0 }] }
    ]
  }
};

const { roster8 } = await import('../../app/core/roster.js');
const { buildDraft, diffDay, filterStudents, historyFor, normalizeRecord, normalizeRecords, orderStudents, pendingChanges, recordsForDate, unattachedRecords } =
  await import('../../app/domain/violations.js');

const [JIA, YI, BING] = roster8.map((student) => student.id);
const DAY = '2026-09-14';
const NOW = new Date('2026-09-14T12:00:00.000Z');

test('旧形态的记录被认出来：姓名换成稳定 ID，date/text 换成 eventDate/content', () => {
  const record = normalizeRecord({ id: 'v1', date: DAY, student: '乙', text: ' 上课讲话 ' });
  assert.equal(record.id, 'v1');
  assert.equal(record.studentId, YI);
  assert.equal(record.eventDate, DAY);
  assert.equal(record.content, '上课讲话');
  assert.equal(record.lastRecordedAt, '', '旧记录没有时间戳，不该凭空编一个');
});

test('认不出学生的记录保留但不参与当日视图，不会静默丢数据', () => {
  const records = normalizeRecords([
    { id: 'x', date: DAY, student: '查无此人', text: '???' },
    { id: 'y', student: YI, text: '没有日期' },
    { id: 'z', date: DAY, student: '甲', text: '迟到' }
  ]);
  assert.equal(records.length, 3);
  assert.equal(unattachedRecords(records).length, 2);
  assert.deepEqual([...recordsForDate(records, DAY).keys()], [JIA]);
  assert.equal(
    records.some((item) => item.content === '???'),
    true,
    '认不出的文字要留着'
  );
});

test('同学生同日多条记录合并成一条，文字接起来而不是丢掉', () => {
  const records = normalizeRecords([
    { id: 'a', date: DAY, student: '甲', text: '迟到', createdAt: '2026-09-14T08:00:00.000Z' },
    { id: 'b', date: DAY, student: '甲', text: '上课说话', createdAt: '2026-09-14T09:00:00.000Z' },
    { id: 'c', date: DAY, student: '甲', text: '迟到', createdAt: '2026-09-14T10:00:00.000Z' }
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].content, '迟到；上课说话', '重复的那条不重复出现');
  assert.equal(records[0].createdAt, '2026-09-14T08:00:00.000Z', '创建时间取最早');
});

test('排序三档：本次会话编辑过的最前，然后当日已有记录按最后编辑时间倒序，其余按花名册顺序', () => {
  const saved = recordsForDate(
    normalizeRecords([
      { id: 'r1', studentId: BING, eventDate: DAY, content: '丙的事', lastRecordedAt: '2026-09-14T10:00:00.000Z' },
      { id: 'r2', studentId: YI, eventDate: DAY, content: '乙的事', lastRecordedAt: '2026-09-14T11:00:00.000Z' }
    ]),
    DAY
  );

  assert.deepEqual(
    orderStudents(saved).map((student) => student.name),
    ['乙', '丙', '甲'],
    '无会话编辑时按已有记录时间倒序，其余按花名册'
  );
  assert.deepEqual(
    orderStudents(saved, [BING]).map((student) => student.name),
    ['丙', '乙', '甲'],
    '刚编辑过的排最前'
  );
  assert.deepEqual(
    orderStudents(saved, [JIA]).map((student) => student.name),
    ['甲', '乙', '丙']
  );
});

test('草稿预填已保存内容，未保存差异只算真正变了的', () => {
  const saved = recordsForDate(normalizeRecords([{ id: 'r', studentId: YI, eventDate: DAY, content: '乙的事' }]), DAY);
  const draft = buildDraft(roster8, saved);

  assert.equal(draft[YI], '乙的事');
  assert.equal(draft[JIA], '');
  assert.deepEqual(pendingChanges(saved, draft), []);
  assert.deepEqual(pendingChanges(saved, { ...draft, [JIA]: '新记录' }), [JIA]);
  assert.deepEqual(pendingChanges(saved, { ...draft, [YI]: '  ' }), [YI], '清空算改动');
  assert.deepEqual(pendingChanges(saved, { ...draft, [JIA]: '   ' }), [], '只敲了空白不算改动');
});

test('整批保存：新增、修改、删除一次算清，其他日期与其他学生不受影响', () => {
  const records = normalizeRecords([
    { id: 'r1', studentId: YI, eventDate: DAY, content: '乙的事', lastRecordedAt: '2026-09-14T11:00:00.000Z' },
    { id: 'r2', studentId: BING, eventDate: DAY, content: '丙的事', lastRecordedAt: '2026-09-14T10:00:00.000Z' },
    { id: 'r3', studentId: JIA, eventDate: '2026-09-13', content: '昨天的事', lastRecordedAt: '2026-09-13T09:00:00.000Z' }
  ]);

  const outcome = diffDay(records, DAY, { [JIA]: '甲今天迟到', [YI]: '乙的事', [BING]: '' }, roster8, NOW);
  assert.deepEqual(outcome.problems, []);
  assert.deepEqual(outcome.added, [JIA]);
  assert.deepEqual(outcome.updated, []);
  assert.deepEqual(outcome.removed, [BING], '清空即删除');

  const untouched = outcome.records.find((item) => item.studentId === YI);
  assert.equal(untouched.lastRecordedAt, '2026-09-14T11:00:00.000Z', '没动过的记录不改时间戳，置顶顺序才稳定');
  const created = outcome.records.find((item) => item.studentId === JIA && item.eventDate === DAY);
  assert.equal(created.content, '甲今天迟到');
  assert.equal(created.lastRecordedAt, NOW.toISOString());
  assert.ok(created.id && created.createdAt);
  assert.equal(outcome.records.find((item) => item.eventDate === '2026-09-13').content, '昨天的事', '其他日期原样带着');
  assert.equal(recordsForDate(outcome.records, DAY).has(BING), false);
  assert.equal(records.length, 3, '不该改动入参');
});

test('改写文字算修改，保留原来的 id 与创建时间', () => {
  const records = normalizeRecords([
    { id: 'r1', studentId: YI, eventDate: DAY, content: '乙的事', createdAt: '2026-09-14T08:00:00.000Z', lastRecordedAt: '2026-09-14T11:00:00.000Z' }
  ]);
  const outcome = diffDay(records, DAY, { [YI]: '乙又讲话了' }, roster8, NOW);
  assert.deepEqual(outcome.updated, [YI]);
  assert.deepEqual(outcome.added, []);
  assert.equal(outcome.records[0].id, 'r1');
  assert.equal(outcome.records[0].createdAt, '2026-09-14T08:00:00.000Z');
  assert.equal(outcome.records[0].lastRecordedAt, NOW.toISOString());
});

test('日期非法或出现名单外的学生时，整批一个字段都不落盘并说清是谁', () => {
  const records = normalizeRecords([{ id: 'r1', studentId: YI, eventDate: DAY, content: '乙的事' }]);

  const badDate = diffDay(records, '', { [YI]: '改一下' }, roster8, NOW);
  assert.equal(badDate.problems.length, 1);
  assert.match(badDate.problems[0].reason, /不是 YYYY-MM-DD/);
  assert.deepEqual(badDate.records, records, '原样退回，等于没写');
  assert.deepEqual(badDate.added, []);

  const stranger = diffDay(records, DAY, { 'local-8-nobody': '不属于这个班' }, roster8, NOW);
  assert.equal(stranger.problems.length, 1);
  assert.equal(stranger.problems[0].studentId, 'local-8-nobody');
  assert.match(stranger.problems[0].reason, /8 班名单/);
  assert.deepEqual(stranger.records, records);
});

test('保存后同学生同日只剩一条，唯一约束不会被破坏', () => {
  const records = normalizeRecords([
    { id: 'a', studentId: JIA, eventDate: DAY, content: '一', lastRecordedAt: '2026-09-14T08:00:00.000Z' },
    { id: 'b', studentId: JIA, eventDate: DAY, content: '二', lastRecordedAt: '2026-09-14T09:00:00.000Z' }
  ]);
  const outcome = diffDay(records, DAY, { [JIA]: '一' }, roster8, NOW);
  const sameDay = outcome.records.filter((item) => item.studentId === JIA && item.eventDate === DAY);
  assert.equal(sameDay.length, 1);
  assert.equal(sameDay[0].content, '一');
});

test('个人历史只取这个学生的记录，按日期倒序（最近的在前）', () => {
  const records = normalizeRecords([
    { id: 'r1', studentId: JIA, eventDate: '2026-09-10', content: '周一迟到' },
    { id: 'r2', studentId: JIA, eventDate: '2026-09-14', content: '上课讲话' },
    { id: 'r3', studentId: YI, eventDate: '2026-09-14', content: '乙的事' }
  ]);

  const history = historyFor(records, JIA);
  assert.deepEqual(
    history.map((item) => item.eventDate),
    ['2026-09-14', '2026-09-10']
  );
  assert.deepEqual(
    history.map((item) => item.content),
    ['上课讲话', '周一迟到']
  );
  assert.equal(
    history.some((item) => item.studentId !== JIA),
    false,
    '不该掺进别人的记录'
  );
  assert.deepEqual(
    historyFor(records, YI).map((item) => item.content),
    ['乙的事']
  );
});

test('个人历史排除认不出学生的记录，只读且不改动入参', () => {
  const records = normalizeRecords([
    { id: 'x', date: DAY, student: '查无此人', text: '???' },
    { id: 'y', student: JIA, text: '没有日期' },
    { id: 'z', date: DAY, student: '甲', text: '迟到' }
  ]);
  const idsBefore = records.map((item) => item.id);

  assert.deepEqual(
    historyFor(records, JIA).map((item) => item.content),
    ['迟到'],
    '认不出学生和没有日期的记录都不属于任何学生'
  );
  assert.deepEqual(historyFor(records, ''), [], '没有学生 ID 就没有历史');
  assert.deepEqual(historyFor(records, 'local-8-nobody'), [], '名单外的 ID 查不到东西');
  assert.deepEqual(
    records.map((item) => item.id),
    idsBefore,
    '排序不该就地改动入参'
  );
});

test('定位学生：包含匹配、忽略大小写与首尾空白，空关键词就是全班', () => {
  const students = [
    { id: 'a', name: '张小明' },
    { id: 'b', name: '李小张' },
    { id: 'c', name: '王芳' },
    { id: 'd', name: 'Alice' }
  ];

  assert.deepEqual(
    filterStudents(students, '张').map((item) => item.id),
    ['a', 'b'],
    '包含匹配，不是只匹配开头'
  );
  assert.deepEqual(
    filterStudents(students, '  张  ').map((item) => item.id),
    ['a', 'b'],
    '首尾空白忽略'
  );
  assert.deepEqual(
    filterStudents(students, 'alice').map((item) => item.id),
    ['d'],
    '忽略大小写'
  );
  assert.deepEqual(filterStudents(students, '查无此人'), []);
  assert.deepEqual(
    filterStudents(students, '').map((item) => item.id),
    ['a', 'b', 'c', 'd'],
    '空关键词就是全班'
  );
  assert.deepEqual(
    filterStudents(students, '   ').map((item) => item.id),
    ['a', 'b', 'c', 'd'],
    '只有空白也算空'
  );
  const returned = filterStudents(students, '');
  assert.notEqual(returned, students, '返回新数组');
  assert.deepEqual(
    students.map((item) => item.id),
    ['a', 'b', 'c', 'd'],
    '不改动入参'
  );
});
