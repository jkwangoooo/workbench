// L6 打印报告 + CSV 导出 + 数据体检的领域逻辑测试
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

// roster 模块依赖 window.WORKBENCH_SEED，先注入一份最小种子。
globalThis.window = {
  WORKBENCH_SEED: {
    classes: [
      {
        name: '2025级8班',
        students: [
          { name: '甲同学', examNumber: 'exam-1', provincialStudentNumber: 'prov-1' },
          { name: '乙同学', examNumber: 'exam-2', provincialStudentNumber: 'prov-2' },
          { name: '丙同学', examNumber: 'exam-3', provincialStudentNumber: 'prov-3' }
        ]
      },
      {
        name: '2025级7班',
        students: [{ name: '丁同学', examNumber: 'exam-4', provincialStudentNumber: 'prov-4' }]
      }
    ]
  }
};

const { testReport, dictationReport, violationsReport } = await import('../../app/domain/print-reports.js');
const { buildTestCsv, buildDictationCsv } = await import('../../app/domain/export-csv.js');
const { formatBytes, lastModifiedAt, estimateBytes } = await import('../../app/domain/data-health.js');
const { roster8 } = await import('../../app/core/roster.js');

const testFixture = {
  title: '第一单元测验',
  fullScore: 100,
  classNumber: '8',
  scores: { [roster8[0].id]: 95, [roster8[1].id]: 88, [roster8[2].id]: 88 },
  references: { [roster8[0].id]: 2 }
};

const dictationFixture = {
  title: '第一单元听写',
  classNumber: '8',
  columns: [
    { id: 'c1', date: '2026-09-14', name: '第一次' },
    { id: 'c2', date: '2026-09-15', name: '第二次' }
  ],
  targets: { [roster8[0].id]: 90, [roster8[1].id]: 85, [roster8[2].id]: 80 },
  scores: {
    [`${roster8[0].id}:c1`]: 92,
    [`${roster8[0].id}:c2`]: 95,
    [`${roster8[1].id}:c1`]: 80,
    [`${roster8[2].id}:c1`]: 75
  }
};

describe('打印报告生成', () => {
  it('单元测试报告含表头、学生姓名与排名', () => {
    const html = testReport(testFixture, '8');
    assert.ok(html.includes('单元测试成绩'), '标题应含单元测试成绩');
    assert.ok(html.includes('第一单元测验'), '应含测试标题');
    assert.ok(html.includes('满分 100'), '应含满分');
    assert.ok(html.includes('甲同学'), '应含第一名学生姓名');
    assert.ok(html.includes('当前排名'), '应有排名表头');
    assert.ok(html.includes('<table>'), '应有表格');
  });

  it('听写报告含目标分、各听写列与状态', () => {
    const html = dictationReport(dictationFixture, '8');
    assert.ok(html.includes('听写成绩'), '标题应含听写成绩');
    assert.ok(html.includes('目标分'), '应有目标分列');
    assert.ok(html.includes('第一次'), '应有第一个听写列');
    assert.ok(html.includes('第二次'), '应有第二个听写列');
    assert.ok(html.includes('达成'), '应有达成状态');
  });

  it('违纪报告按日期分组，空记录给空提示', () => {
    const html = violationsReport([
      { eventDate: '2026-09-14', studentId: roster8[0].id, content: '课堂讲话' },
      { eventDate: '2026-09-15', studentId: roster8[1].id, content: '迟到' }
    ]);
    assert.ok(html.includes('8班违纪记录'), '应有标题');
    assert.ok(html.includes('课堂讲话'), '应含违纪内容');
    assert.ok(html.includes('2026年09月14日'), '应按日期分组显示');

    const empty = violationsReport([]);
    assert.ok(empty.includes('还没有违纪记录'), '空记录应有空提示');
  });

  it('没有测试/听写数据时给空提示', () => {
    assert.ok(testReport(null, '8').includes('还没有测试数据'));
    assert.ok(dictationReport(null, '8').includes('还没有听写数据'));
  });
});

describe('CSV 导出', () => {
  it('单元测试 CSV 带 BOM、表头与排名', () => {
    const csv = buildTestCsv(testFixture, '8');
    assert.ok(csv.startsWith('\uFEFF'), '应以 BOM 开头');
    assert.ok(csv.includes('姓名,成绩,当前排名,历史排名对照'), '应有表头');
    assert.ok(csv.includes('甲同学'), '应含学生姓名');
    assert.ok(csv.includes(',95,'), '应含成绩');
  });

  it('听写 CSV 带 BOM、表头含听写列', () => {
    const csv = buildDictationCsv(dictationFixture, '8');
    assert.ok(csv.startsWith('\uFEFF'), '应以 BOM 开头');
    assert.ok(csv.includes('姓名,目标分'), '应有目标分列');
    assert.ok(csv.includes('第一次'), '应含听写列名');
    assert.ok(csv.includes('达成'), '应含状态');
  });
});

describe('数据体检', () => {
  it('lastModifiedAt 找出最晚时间戳', () => {
    const value = [{ updatedAt: '2026-09-14T10:00:00Z' }, { updatedAt: '2026-09-15T08:00:00Z' }];
    const ts = lastModifiedAt(value);
    assert.equal(ts, Date.parse('2026-09-15T08:00:00Z'));
  });

  it('lastModifiedAt 认多种时间戳字段，认不出返回 null', () => {
    assert.equal(lastModifiedAt({ uploadedAt: '2026-09-15T00:00:00Z' }), Date.parse('2026-09-15T00:00:00Z'));
    assert.equal(lastModifiedAt({ text: '无时间戳' }), null);
    assert.equal(lastModifiedAt(null), null);
  });

  it('estimateBytes 按 JSON 序列化长度估算', () => {
    assert.equal(estimateBytes(null), 0);
    assert.equal(estimateBytes({ a: 1 }), JSON.stringify({ a: 1 }).length * 2);
  });

  it('formatBytes 正确换算单位', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(512), '512 B');
    assert.equal(formatBytes(1024), '1.0 KB');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
  });
});
