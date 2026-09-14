import { test } from 'node:test';
import assert from 'node:assert/strict';

const { stableKeyOf, stableStudentId, fnv1a } = await import('../../app/core/student-id.js');

function useSeed(students8, students7 = []) {
  globalThis.window = {
    WORKBENCH_SEED: {
      classes: [
        { name: '2025级8班', students: students8 },
        { name: '2025级7班', students: students7 }
      ]
    }
  };
}

const student = (name, sortOrder, provincialStudentNumber, examNumber) => ({ name, sortOrder, provincialStudentNumber, examNumber });

test('稳定键优先用证件类编号，都缺失时退回姓名', () => {
  assert.equal(stableKeyOf({ name: '甲', provincialStudentNumber: 'A1', examNumber: 'E1' }), 'provincialStudentNumber:A1');
  assert.equal(stableKeyOf({ name: '甲', examNumber: 'E1' }), 'examNumber:E1');
  assert.equal(stableKeyOf({ name: '甲', identityNumber: 'I1' }), 'identityNumber:I1');
  assert.equal(stableKeyOf({ name: '甲' }), 'name:甲');
  assert.equal(stableKeyOf({ name: '  甲  ' }), 'name:甲');
});

test('同一个学生永远得到同一个 ID，不同班级不串号', () => {
  const 甲 = { name: '甲', provincialStudentNumber: 'A1' };
  assert.equal(stableStudentId('8', 甲), stableStudentId('8', { ...甲 }));
  assert.notEqual(stableStudentId('7', 甲), stableStudentId('8', 甲));
  assert.equal(fnv1a(''), '811c9dc5');
});

test('ID 只取决于学生本人信息，与种子里的排列顺序无关', async () => {
  useSeed([student('甲', 0, 'A1', 'E1'), student('乙', 1, 'A2', 'E2')]);
  const first = await import('../../app/core/roster.js?v=order-a');

  useSeed([student('乙', 1, 'A2', 'E2'), student('甲', 0, 'A1', 'E1')]);
  const second = await import('../../app/core/roster.js?v=order-b');

  assert.deepEqual(
    second.roster8.map((item) => [item.name, item.id]),
    first.roster8.map((item) => [item.name, item.id])
  );
});

test('ID 里不出现真实学籍号或准考证号', async () => {
  useSeed([student('甲', 0, 'G123456789', 'K987654321')]);
  const { roster8 } = await import('../../app/core/roster.js?v=privacy');
  const id = roster8[0].id;

  assert.match(id, /^local-8-[0-9a-f]{8}$/);
  assert.ok(!id.includes('G123456789'), 'ID 不应包含省学籍辅号');
  assert.ok(!id.includes('K987654321'), 'ID 不应包含准考证号');
  assert.ok(!id.includes('甲'), 'ID 不应包含姓名');
});

test('旧 ID 与新稳定 ID 的映射覆盖全班且一一对应', async () => {
  useSeed([student('甲', 0, 'A1', 'E1'), student('乙', 1, 'A2', 'E2')], [student('丙', 0)]);
  const { legacyIdMap, roster8, roster7 } = await import('../../app/core/roster.js?v=map');

  assert.equal(legacyIdMap.size, 3);
  assert.equal(legacyIdMap.get('local-8-1'), roster8[0].id);
  assert.equal(legacyIdMap.get('local-8-2'), roster8[1].id);
  assert.equal(legacyIdMap.get('local-7-1'), roster7[0].id);
  assert.equal(new Set(legacyIdMap.values()).size, 3, '新 ID 不应重复');
});

test('同名学生仍拿到互不相同的 ID', async () => {
  useSeed([], [student('同名', 0), student('同名', 1), student('同名', 2)]);
  const { roster7 } = await import('../../app/core/roster.js?v=dupe');
  const ids = roster7.map((item) => item.id);

  assert.equal(new Set(ids).size, 3, '三个同名学生的 ID 必须互不相同');
  assert.match(ids[0], /^local-7-[0-9a-f]{8}$/);
  assert.equal(ids[1], `${ids[0]}-2`);
  assert.equal(ids[2], `${ids[0]}-3`);
});
