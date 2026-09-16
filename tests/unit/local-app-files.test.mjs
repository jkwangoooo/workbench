// 工作文件领域逻辑测试（需求 §4）+ 备课中心 URL 校验（需求 §6）
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  filterFiles,
  findDuplicate,
  formatSize,
  guessMime,
  isPreviewable,
  normalizeCategory,
  normalizedName,
  validateFile
} from '../../app/domain/files.js';
import { isPrepConfigured, prepWorkflowUrl } from '../../app/domain/prep.js';

function fakeFile(name, size = 100, type = '') {
  return { name, size, type };
}

describe('工作文件领域逻辑', () => {
  it('validateFile 接受常见办公文件、图片、TXT', () => {
    for (const ext of ['.docx', '.xlsx', '.pptx', '.pdf', '.png', '.txt']) {
      const result = validateFile(fakeFile(`报告${ext}`, 1000));
      assert.ok(result.ok, `${ext} 应被接受`);
    }
  });

  it('validateFile 拒绝不支持的类型', () => {
    const result = validateFile(fakeFile('视频.mp4', 1000));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('不支持'), '应提示不支持的类型');
  });

  it('validateFile 拒绝超过 50MB 的文件', () => {
    const result = validateFile(fakeFile('大文件.docx', MAX_FILE_SIZE + 1));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes('50MB'), '应提示超过上限');
  });

  it('validateFile 拒绝大小为 0 的文件', () => {
    const result = validateFile(fakeFile('空.docx', 0));
    assert.equal(result.ok, false);
  });

  it('normalizeCategory 去首尾空格', () => {
    assert.equal(normalizeCategory('  教案  '), '教案');
    assert.equal(normalizeCategory(''), '');
  });

  it('normalizedName 大小写不敏感折叠', () => {
    assert.equal(normalizedName(' 报告.DOCX '), '报告.docx');
  });

  it('findDuplicate 只在同分类下判重', () => {
    const files = [
      { id: 'f1', originalName: '教案.docx', category: '教案' },
      { id: 'f2', originalName: '教案.docx', category: '课件' }
    ];
    // 同分类同名 → 命中
    assert.equal(findDuplicate(files, '教案', '教案.docx').id, 'f1');
    // 不同分类同名 → 不命中
    assert.equal(findDuplicate(files, '其他', '教案.docx'), null);
  });

  it('guessMime 从扩展名推断 MIME', () => {
    assert.equal(guessMime('.pdf'), 'application/pdf');
    assert.equal(guessMime('.txt'), 'text/plain');
    assert.equal(guessMime('.docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('isPreviewable 只认 PDF/图片/TXT', () => {
    assert.ok(isPreviewable('application/pdf'));
    assert.ok(isPreviewable('image/png'));
    assert.ok(isPreviewable('text/plain'));
    assert.ok(!isPreviewable('application/msword'));
  });

  it('formatSize 输出可读文本', () => {
    assert.equal(formatSize(500), '500 B');
    assert.equal(formatSize(2048), '2.0 KB');
    assert.equal(formatSize(5 * 1024 * 1024), '5.0 MB');
  });
});

describe('备课中心 URL 校验', () => {
  it('接受合法 https 绝对地址', () => {
    const result = prepWorkflowUrl('https://prep.example.com/workflow');
    assert.equal(result.configured, true);
    assert.equal(result.url, 'https://prep.example.com/workflow');
    assert.ok(isPrepConfigured('https://prep.example.com'));
  });

  it('拒绝 http 地址', () => {
    const result = prepWorkflowUrl('http://prep.example.com');
    assert.equal(result.configured, false);
    assert.ok(result.error.includes('https'));
  });

  it('拒绝空值、相对路径、javascript 伪协议', () => {
    assert.equal(prepWorkflowUrl('').configured, false);
    assert.equal(prepWorkflowUrl('   ').configured, false);
    assert.equal(prepWorkflowUrl('/relative/path').configured, false);
    assert.equal(prepWorkflowUrl('javascript:alert(1)').configured, false);
    assert.equal(prepWorkflowUrl('data:text/html,x').configured, false);
  });

  it('拒绝缺少主机名的地址', () => {
    assert.equal(prepWorkflowUrl('https://').configured, false);
  });

  it('剥离查询参数（不携带 token/学生数据）', () => {
    const result = prepWorkflowUrl('https://prep.example.com?token=secret&student=1');
    assert.equal(result.url, 'https://prep.example.com/');
  });
});

describe('工作文件列表筛选（资源库 → 工作文件）', () => {
  const files = [
    { id: 'a', originalName: '第一课教案.docx', category: '教案' },
    { id: 'b', originalName: '第二课教案.docx', category: '教案' },
    { id: 'c', originalName: '期中试卷.pdf', category: '试卷' },
    { id: 'd', originalName: 'Lesson-Plan.docx', category: '' }
  ];

  it('按文件名包含匹配，忽略大小写与首尾空白', () => {
    assert.deepEqual(
      filterFiles(files, '教案', '').map((f) => f.id),
      ['a', 'b']
    );
    assert.deepEqual(
      filterFiles(files, '  教案  ', '').map((f) => f.id),
      ['a', 'b']
    );
    assert.deepEqual(
      filterFiles(files, 'lesson', '').map((f) => f.id),
      ['d']
    );
    assert.deepEqual(
      filterFiles(files, 'LESSON-PLAN', '').map((f) => f.id),
      ['d']
    );
  });

  it('两个条件都为空时返回全部，且不改动入参', () => {
    assert.deepEqual(
      filterFiles(files, '', '').map((f) => f.id),
      ['a', 'b', 'c', 'd']
    );
    assert.deepEqual(
      filterFiles(files, '   ', '   ').map((f) => f.id),
      ['a', 'b', 'c', 'd']
    );
    assert.deepEqual(
      files.map((f) => f.id),
      ['a', 'b', 'c', 'd']
    );
  });

  it('分类是精确匹配，与文件名条件同时生效', () => {
    assert.deepEqual(
      filterFiles(files, '', '试卷').map((f) => f.id),
      ['c']
    );
    assert.deepEqual(filterFiles(files, '教案', '试卷'), [], '两个条件是与关系');
    assert.deepEqual(
      filterFiles(files, '第', '教案').map((f) => f.id),
      ['a', 'b']
    );
  });

  it('匹配不到时返回空数组', () => {
    assert.deepEqual(filterFiles(files, '查无此文件', ''), []);
  });
});
