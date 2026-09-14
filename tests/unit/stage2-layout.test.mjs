import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('stage2 migration keeps grouping and seating tables and RPCs independent', async () => {
  const sql = await readFile('supabase/migrations/202609030001_stage2_group_seating.sql', 'utf8');
  assert.match(sql, /class_group_layouts/);
  assert.match(sql, /class_seating_layouts/);
  assert.match(sql, /replace_group_layout/);
  assert.match(sql, /replace_seating_layout/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /student owner\/class mismatch/);
  assert.doesNotMatch(sql, /cohort_year|class_number/);
  assert.match(sql, /c\.owner_id\s*=\s*auth\.uid\(\)\s+and\s+c\.name\s*=\s*'2025级8班'/);
  assert.match(sql, /drop trigger if exists class_group_layouts_scope/);
  assert.match(sql, /drop trigger if exists class_seating_layouts_scope/);
  assert.match(sql, /drop policy if exists class_group_layouts_owner/);
  assert.match(sql, /drop policy if exists class_seating_cells_owner/);
  assert.match(sql, /jsonb_array_length\(p_cells\) <> 72/);
  assert.match(sql, /podium row required/);
  assert.match(sql, /aisle column required/);
});

test('stage2 parsers enforce fixed template contracts and duplicate rejection', async () => {
  const [group, seating, page] = await Promise.all([
    readFile('src/modules/class-management/imports/groupTemplateParser.ts', 'utf8'),
    readFile('src/modules/class-management/imports/seatingTemplateParser.ts', 'utf8'),
    readFile('src/modules/class-management/pages/ClassManagementPage.ts', 'utf8')
  ]);
  assert.match(group, /组别/);
  assert.match(group, /学生重复/);
  assert.match(group, /filter\(\(\{ name \}\)/);
  assert.match(seating, /模板版本/);
  assert.match(seating, /结构标记未知/);
  assert.match(page, /分组表/);
  assert.match(page, /座次表/);
  assert.match(page, /确认保存/);
  assert.match(page, /'EMPTY'/);
});

test('stage2 fixed seating structure and refresh mappings are explicit', async () => {
  const [domain, groupRepository, seatingRepository] = await Promise.all([
    readFile('src/modules/class-management/domain/seating-layout.ts', 'utf8'),
    readFile('src/modules/class-management/data/groupLayoutRepository.ts', 'utf8'),
    readFile('src/modules/class-management/data/seatingLayoutRepository.ts', 'utf8')
  ]);
  assert.match(domain, /rowIndex === 0 \? 'podium'/);
  assert.match(domain, /columnIndex === 4 \? 'aisle'/);
  assert.match(domain, /座次表必须是8行9列/);
  assert.match(groupRepository, /template_version/);
  assert.match(groupRepository, /group_index/);
  assert.match(groupRepository, /displayName/);
  assert.match(groupRepository, /mapGroupLayout/);
  assert.match(seatingRepository, /row_index/);
  assert.match(seatingRepository, /column_index/);
  assert.match(seatingRepository, /cell_kind/);
  assert.match(seatingRepository, /mapSeatingLayout/);
});

test('stage2 upload previews are isolated from saved layouts and save only on confirmation', async () => {
  const page = await readFile('src/modules/class-management/pages/ClassManagementPage.ts', 'utf8');
  assert.match(page, /savedGroupLayout/);
  assert.match(page, /draftGroupLayout/);
  assert.match(page, /savedSeatingLayout/);
  assert.match(page, /draftSeatingLayout/);
  assert.match(page, /cancelCurrentDraft/);
  assert.match(page, /this\.draftGroupLayout = null; this\.groupErrors = \[\];/);
  assert.match(page, /this\.draftSeatingLayout = null; this\.seatingErrors = \[\];/);
  assert.doesNotMatch(page, /this\.groupLayout\s*=|this\.seatingLayout\s*=/);
  const uploadSection = page.slice(page.indexOf('private async handleUpload'), page.indexOf('private cancelCurrentDraft'));
  assert.doesNotMatch(uploadSection, /\.replace\s*\(/);
  const confirmSection = page.slice(page.indexOf('private async confirmLayout'));
  assert.match(confirmSection, /this\.groups\.replace/);
  assert.match(confirmSection, /this\.seating\.replace/);
});

test('stage2 verification SQL is metadata-only', async () => {
  const sql = await readFile('supabase/verification/stage2_metadata.sql', 'utf8');
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /pg_policies/);
  assert.match(sql, /pg_indexes/);
  assert.match(sql, /information_schema\.triggers/);
  assert.match(sql, /information_schema\.routines/);
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|create|drop)\b/i);
});
