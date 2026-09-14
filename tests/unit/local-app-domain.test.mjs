import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { WORKBENCH_SEED: { classes: [] } };

const { parseCsvText } = await import('../../app/io/read-workbook.js');
const { rankFor } = await import('../../app/domain/ranking.js');
const { validateHttpUrl } = await import('../../app/domain/url.js');
const { buildGroupTemplateCsv, GROUP_TEMPLATE_HEADER } = await import('../../app/domain/group-template.js');
const { buildSeatingTemplateCsv, parseSeating, expectedKindAt } = await import('../../app/domain/seating-template.js');

test('CSV 解析支持引号、逗号、CRLF 与 BOM', () => {
  const rows = parseCsvText('\uFEFF组别,成员1,成员2,成员3,成员4,组长\r\n1,张三,李四,,,张三\r\n');
  assert.deepEqual(rows, [
    ['组别', '成员1', '成员2', '成员3', '成员4', '组长'],
    ['1', '张三', '李四', '', '', '张三']
  ]);

  const quoted = parseCsvText('a,b\n"含,逗号","含""引号"""\n');
  assert.deepEqual(quoted, [
    ['a', 'b'],
    ['含,逗号', '含"引号"']
  ]);

  assert.deepEqual(parseCsvText('\n\n'), []);
});

test('并列分数使用同名次，后续名次跳位', () => {
  const testSheet = {
    scores: { a: 100, b: 95, c: 95, d: 90, e: '' }
  };
  assert.equal(rankFor(testSheet, 'a'), '1');
  assert.equal(rankFor(testSheet, 'b'), '2');
  assert.equal(rankFor(testSheet, 'c'), '2');
  assert.equal(rankFor(testSheet, 'd'), '4');
  assert.equal(rankFor(testSheet, 'e'), '—');
});

test('网址只接受 http/https 绝对地址', () => {
  assert.equal(validateHttpUrl('https://example.com/a?b=1').url, 'https://example.com/a?b=1');
  assert.equal(validateHttpUrl('  http://example.com  ').url, 'http://example.com');
  assert.ok(validateHttpUrl('').error);
  assert.ok(validateHttpUrl('example.com').error);
  assert.ok(validateHttpUrl('javascript:alert(1)').error);
  assert.ok(validateHttpUrl('data:text/html,x').error);
  assert.ok(validateHttpUrl('/local/path').error);
});

test('分组模板表头与解析器一致', () => {
  assert.equal(buildGroupTemplateCsv().split('\n')[0], GROUP_TEMPLATE_HEADER.join(','));
});

test('座次固定结构：整行讲台 + 后七行第5列过道', () => {
  assert.equal(expectedKindAt(0, 0), 'podium');
  assert.equal(expectedKindAt(0, 8), 'podium');
  assert.equal(expectedKindAt(1, 4), 'aisle');
  assert.equal(expectedKindAt(7, 4), 'aisle');
  assert.equal(expectedKindAt(1, 0), undefined);
  assert.equal(expectedKindAt(7, 8), undefined);
});

test('座次标准模板能被自身解析器接受', () => {
  const rows = parseCsvText(buildSeatingTemplateCsv());
  assert.equal(rows.length, 10, '应为 2 行元信息 + 8 行座位');
  const result = parseSeating(rows);
  assert.deepEqual(result.errors, [], '标准模板不应产生错误');
  assert.equal(result.layout.cells.length, 72);
  assert.equal(result.layout.cells.filter((cell) => cell.cellKind === 'podium').length, 9);
  assert.equal(result.layout.cells.filter((cell) => cell.cellKind === 'aisle').length, 7);
});

test('旧的错误座次结构现在被拒绝', () => {
  const wrong = ['模板版本,1', '行数,8,列数,9'];
  for (let row = 0; row < 8; row += 1) {
    wrong.push(Array.from({ length: 9 }, (_, column) => (row === 0 && column === 0 ? 'PODIUM' : column === 4 ? 'AISLE' : 'EMPTY')).join(','));
  }
  const result = parseSeating(parseCsvText(wrong.join('\n')));
  assert.equal(result.layout, undefined, '旧结构不应被接受');
  assert.ok(
    result.errors.some((message) => message.includes('必须为讲台结构')),
    '应指出讲台行不完整'
  );
});

test('座次表拒绝结构格放错位置与重复学生', () => {
  const rows = parseCsvText(buildSeatingTemplateCsv());
  rows[3][2] = 'AISLE';
  rows[4][0] = 'PODIUM';
  const result = parseSeating(rows);
  assert.ok(result.errors.some((message) => message.includes('结构格位置不合法')));
  assert.equal(result.layout, undefined);
});
