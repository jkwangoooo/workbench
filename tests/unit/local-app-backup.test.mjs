import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  WORKBENCH_SEED: {
    classes: [
      {
        name: '2025级8班',
        students: [
          { name: '甲', sortOrder: 0, provincialStudentNumber: 'A1' },
          { name: '乙', sortOrder: 1, provincialStudentNumber: 'A2' }
        ]
      },
      { name: '2025级7班', students: [{ name: '丙', sortOrder: 0 }] }
    ]
  }
};

function installStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  return store;
}

const { LOCAL_KEYS, EXPORT_KEYS, LOCAL_ONLY_KEYS } = await import('../../app/core/constants.js');
const { roster8, legacyIdMap } = await import('../../app/core/roster.js');
const { backupFilename, buildBackup, collectData, countRecords, parseBackup, rosterProfile, validateBackup } = await import('../../app/domain/backup.js');
const { STUDENT_ID_SCHEMA, migrateStudentIds, remapStudentIds } = await import('../../app/domain/migrate.js');

test('每个数据键都登记进了备份白名单或本机专用名单', () => {
  const registered = new Set(EXPORT_KEYS.concat(LOCAL_ONLY_KEYS));
  for (const key of Object.values(LOCAL_KEYS)) assert.ok(registered.has(key), `${key} 未登记，备份会漏数据`);
  assert.equal(registered.size, EXPORT_KEYS.length + LOCAL_ONLY_KEYS.length, '两份名单不应重叠');
  assert.ok(!EXPORT_KEYS.includes(LOCAL_KEYS.meta), 'meta 属于本机专用，不应随备份导出');
});

test('备份可以完整导出并原样恢复', () => {
  const data = {
    [LOCAL_KEYS.todos]: [{ id: 'todo-1', text: '改作业', due: '2026-09-15', done: false }],
    [LOCAL_KEYS.homework]: { '8:2026-09-14': { 'local-8-x': { rating: '优', note: '' } } }
  };
  const backup = buildBackup(data, '2026-09-14T15:30:00.000Z');
  const result = parseBackup(JSON.stringify(backup));

  assert.equal(result.ok, true);
  assert.equal(result.backup.exportedAt, '2026-09-14T15:30:00.000Z');
  assert.deepEqual(result.backup.data, data);
  assert.deepEqual(result.ignored, []);
});

test('非法备份被拒绝，白名单外的键被忽略', () => {
  assert.equal(parseBackup('{ 不是 json').ok, false);
  assert.equal(parseBackup('"字符串"').ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'other-app', data: {} })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ app: 'teacher-workbench' })).ok, false);

  const mixed = validateBackup({ app: 'teacher-workbench', data: { [LOCAL_KEYS.todos]: [], 'teacher-local-unknown': 1 } });
  assert.equal(mixed.ok, true);
  assert.deepEqual(Object.keys(mixed.backup.data), [LOCAL_KEYS.todos]);
  assert.deepEqual(mixed.ignored, ['teacher-local-unknown']);
});

test('导出只收白名单内的键，收不到的键不会凭空生成', () => {
  installStorage({ [LOCAL_KEYS.todos]: JSON.stringify([{ id: 't' }]), 'teacher-local-unknown': '"x"' });
  const data = collectData();

  assert.deepEqual(Object.keys(data), [LOCAL_KEYS.todos]);
  assert.deepEqual(data[LOCAL_KEYS.todos], [{ id: 't' }]);
});

test('记录条数按数组长度或对象键数计', () => {
  assert.equal(countRecords([1, 2, 3]), 3);
  assert.equal(countRecords({ a: 1, b: 2 }), 2);
  assert.equal(countRecords([]), 0);
  assert.equal(countRecords(null), 0);
  assert.equal(countRecords(undefined), 0);
});

test('备份文件名带日期与时间', () => {
  assert.equal(backupFilename(new Date(2026, 8, 14, 23, 50)), 'workbench-backup-20260914-2350.json');
});

test('名单指纹反映人数，可用于恢复前核对', () => {
  const profile = rosterProfile();
  assert.equal(profile.count8, 2);
  assert.equal(profile.count7, 1);
  assert.match(profile.fingerprint, /^[0-9a-f]{8}$/);
});

test('迁移把旧学生 ID 改写为稳定 ID，覆盖成绩、听写与布局', () => {
  const map = new Map([
    ['local-8-1', 'local-8-aaaa1111'],
    ['local-8-2', 'local-8-bbbb2222']
  ]);
  const data = {
    [LOCAL_KEYS.homework]: { '8:2026-09-14': { 'local-8-1': { rating: '优' } } },
    [LOCAL_KEYS.tests]: [{ id: 'test-1', scores: { 'local-8-2': 95 }, references: { 'local-8-1': 88 } }],
    [LOCAL_KEYS.dictation]: [{ id: 'dict-1', targets: { 'local-8-1': 90 }, scores: { 'local-8-2:column-1': 80 } }],
    [LOCAL_KEYS.groupLayout]: { templateVersion: 1, groups: [{ groupIndex: 1, members: [{ studentId: 'local-8-1', displayName: '甲' }] }] },
    [LOCAL_KEYS.seatingLayout]: { templateVersion: 1, cells: [{ rowIndex: 1, columnIndex: 0, cellKind: 'student', studentId: 'local-8-2', displayName: '乙' }] }
  };
  const result = remapStudentIds(data, map);

  assert.deepEqual(Object.keys(result.data[LOCAL_KEYS.homework]['8:2026-09-14']), ['local-8-aaaa1111']);
  assert.deepEqual(Object.keys(result.data[LOCAL_KEYS.tests][0].scores), ['local-8-bbbb2222']);
  assert.deepEqual(Object.keys(result.data[LOCAL_KEYS.tests][0].references), ['local-8-aaaa1111']);
  assert.deepEqual(Object.keys(result.data[LOCAL_KEYS.dictation][0].targets), ['local-8-aaaa1111']);
  assert.deepEqual(Object.keys(result.data[LOCAL_KEYS.dictation][0].scores), ['local-8-bbbb2222:column-1']);
  assert.equal(result.data[LOCAL_KEYS.groupLayout].groups[0].members[0].studentId, 'local-8-aaaa1111');
  assert.equal(result.data[LOCAL_KEYS.seatingLayout].cells[0].studentId, 'local-8-bbbb2222');
  // 7 处旧 ID：作业反馈 1、单元测试 2（scores + references）、听写 2（targets + scores）、分组 1、座次 1
  assert.equal(result.changed, 7);
  assert.deepEqual(Object.keys(data[LOCAL_KEYS.homework]['8:2026-09-14']), ['local-8-1'], '不应改动入参');
});

test('迁移认不出的旧 ID 原样保留，不会丢数据', () => {
  const result = remapStudentIds({ [LOCAL_KEYS.homework]: { k: { 'local-8-999': { rating: '优' } } } }, new Map());
  assert.deepEqual(Object.keys(result.data[LOCAL_KEYS.homework].k), ['local-8-999']);
  assert.equal(result.changed, 0);
});

test('学生 ID 迁移只跑一次，重复执行不再改动', () => {
  const legacyId = roster8[0].legacyId;
  const store = installStorage({
    [LOCAL_KEYS.todos]: JSON.stringify([{ id: 'todo-1', text: '改作业' }]),
    [LOCAL_KEYS.tests]: JSON.stringify([{ id: 'test-1', scores: { [legacyId]: 90 }, references: {} }])
  });

  const first = migrateStudentIds();
  assert.equal(first.migrated, true);
  assert.equal(first.changed, 1);
  assert.deepEqual(Object.keys(JSON.parse(store.get(LOCAL_KEYS.tests))[0].scores), [roster8[0].id]);
  assert.equal(JSON.parse(store.get(LOCAL_KEYS.meta)).studentIdSchema, STUDENT_ID_SCHEMA);

  const second = migrateStudentIds();
  assert.equal(second.migrated, false);
  assert.equal(second.changed, 0);
});

test('真实名单下旧 ID 与新 ID 确实不同，迁移有实际效果', () => {
  assert.ok(legacyIdMap.size >= 3);
  for (const [legacyId, stableId] of legacyIdMap) assert.notEqual(legacyId, stableId, `${legacyId} 应被改写`);
});
