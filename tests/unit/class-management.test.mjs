import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('stage1 page is isolated to 8班 and has four-field search plus masked profiles', async () => {
  const [page, domain] = await Promise.all([
    readFile('src/modules/class-management/pages/ClassManagementPage.ts', 'utf8'),
    readFile('src/modules/class-management/domain/student.ts', 'utf8')
  ]);
  assert.match(page, /2025级8班班级管理/);
  assert.match(page, /身份证件号、省学籍辅号或准考证号/);
  assert.match(domain, /已隐藏/);
  assert.doesNotMatch(page, /2025级7班/);
  assert.doesNotMatch(page, /localStorage/);
});

test('student ID profile field is grouped and masked by default', async () => {
  const domain = await readFile('src/modules/class-management/domain/student.ts', 'utf8');
  assert.match(domain, /keys: \['姓名', '请选择性别', '学生身份证号'\]/);
  assert.match(domain, /'学生身份证号'/);
});

test('student repository keeps profile reads separate from roster list', async () => {
  const source = await readFile('src/modules/class-management/data/studentRepository.ts', 'utf8');
  assert.match(source, /student_roster_details\?select=student_id/);
  assert.match(source, /student_profiles\?select=gender/);
  assert.doesNotMatch(source.slice(source.indexOf('listRoster8'), source.indexOf('getProfile')), /student_profiles/);
});

test('migration has RLS and owner/class scope trigger', async () => {
  const sql = await readFile('supabase/migrations/202608310002_stage1_student_directory.sql', 'utf8');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /enforce_student_detail_scope/);
  assert.match(sql, /student_class <> new\.class_id/);
});

test('preflight rules preserve IDs and reject profile data for 7班', async () => {
  const source = await readFile('src/modules/class-management/imports/updatePreflight.ts', 'utf8');
  assert.match(source, /classId !== '8'/);
  assert.match(source, /matched/);
  assert.match(source, /missing/);
});
