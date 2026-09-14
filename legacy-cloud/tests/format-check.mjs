// 归档代码的格式卫生检查：只查 CRLF 与行尾空白，不做重排（归档代码不再开发）。
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const files = [
  'src/main.ts',
  'src/shared/database/client.ts',
  'src/shared/auth/session.ts',
  'src/shared/student-directory/contracts.ts',
  'src/modules/class-management/domain/student.ts',
  'src/modules/class-management/domain/group-layout.ts',
  'src/modules/class-management/domain/seating-layout.ts',
  'src/modules/class-management/data/studentRepository.ts',
  'src/modules/class-management/data/groupLayoutRepository.ts',
  'src/modules/class-management/data/seatingLayoutRepository.ts',
  'src/modules/class-management/pages/ClassManagementPage.ts',
  'src/modules/class-management/imports/updatePreflight.ts',
  'src/modules/class-management/imports/templateContracts.ts',
  'src/modules/class-management/imports/groupTemplateParser.ts',
  'src/modules/class-management/imports/seatingTemplateParser.ts',
  'src/modules/class-management/imports/importValidation.ts'
];
for (const file of files) {
  const text = await readFile(join(root, file), 'utf8');
  if (text.includes('\r') || /[ \t]+\n/.test(text)) throw new Error(`format check failed: ${file}`);
}
console.log(`format check passed (${files.length} files)`);
