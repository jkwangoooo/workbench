import { class7Name, class8Name } from '../core/constants.js';
import { today } from '../core/date.js';
import { button, empty, esc, inputField, selectField } from '../core/dom.js';
import { roster8 } from '../core/roster.js';
import { state } from '../core/state.js';
import { groupPreview, seatingPreview } from '../pages/layouts.js';

export function modalHtml() {
  const modal = state.modal;
  let title = modal.title;
  let body = modal.body;
  if (modal.type === 'note')
    body = `<form data-form="note">${inputField('日期', 'date', today, 'date')}<div class="local-field full"><label>内容</label><textarea class="local-textarea" name="text" required></textarea></div><div class="local-actions-row">${button('取消', 'close-modal')}${button('保存记录', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'violation')
    body = `<form data-form="violation">${inputField('日期', 'date', today, 'date')}${selectField(
      '学生',
      'student',
      roster8.map((student) => [student.name, student.name]),
      ''
    )}<div class="local-field full"><label>具体事项</label><textarea class="local-textarea" name="text" required></textarea></div><div class="local-actions-row">${button('取消', 'close-modal')}${button('保存记录', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'homework')
    body = `<form data-form="homework">${selectField(
      '班级',
      'classNumber',
      [
        ['8', class8Name],
        ['7', class7Name]
      ],
      state.homeworkClass
    )}${inputField('日期', 'date', today, 'date')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('打开反馈', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'todos')
    body = `<form data-form="todo">${inputField('事项内容', 'text', '', 'text', 'required')}${inputField('截止日期', 'due', today, 'date')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('保存待办', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'dictation')
    body = `<form data-form="dictation">${selectField(
      '班级',
      'classNumber',
      [
        ['8', class8Name],
        ['7', class7Name]
      ],
      state.dictationClass
    )}${inputField('阶段名称', 'title', '', 'text', 'required')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('新建阶段', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'dictation-column')
    body = `<form data-form="dictation-column">${inputField('日期', 'date', today, 'date')}${inputField('听写名称', 'name', '听写', 'text', 'required')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('添加听写', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'test')
    body = `<form data-form="test">${selectField(
      '班级',
      'classNumber',
      [
        ['8', class8Name],
        ['7', class7Name]
      ],
      state.testClass
    )}${inputField('测试名称', 'title', '', 'text', 'required')}${inputField('满分', 'fullScore', '100', 'number', 'min="1" required')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('新建测试', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'unit')
    body = `<form data-form="unit">${inputField('单元名称', 'title', '', 'text', 'required')}<div class="local-field full"><label>课时内容（每行一课时）</label><textarea class="local-textarea" name="lessons" required placeholder="输入课时内容"></textarea></div><div class="local-actions-row">${button('取消', 'close-modal')}${button('保存单元', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'resource')
    body = `<form data-form="resource">${inputField('名称', 'name', '', 'text', 'required')}${inputField('网址', 'url', 'https://', 'url', 'required')}${inputField('分类', 'category', '常用')}${inputField('备注', 'note', '')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('保存网址', 'submit-form', 'primary')}</div></form>`;
  if (modal.type === 'import') body = importModal(modal.kind);
  return `<div class="local-modal-backdrop" data-modal-backdrop><div class="local-modal"><h3>${esc(title)}</h3>${body}</div></div>`;
}
export function importModal(kind) {
  const pending = state.pendingImport;
  const errors = pending?.errors || [];
  const preview = pending?.layout
    ? kind === 'groups'
      ? groupPreview(pending.layout)
      : seatingPreview(pending.layout)
    : empty('选择模板文件后显示预览');
  return `<div class="local-notice">${kind === 'groups' ? '表头：组别、成员1、成员2、成员3、成员4、组长' : '模板版本、1；行数、8、列数、9；后续为8×9座位结构'}</div><div class="local-field"><label>选择 CSV 或 XLSX 文件</label><input type="file" data-template-file accept=".csv,.xlsx,.xls"></div>${errors.length ? `<div class="local-error">${errors.map((error) => `<div>${esc(error)}</div>`).join('')}</div>` : ''}<div class="local-import-preview">${preview}</div><div class="local-actions-row">${button('取消', 'cancel-import')}${button('确认保存', 'confirm-import', `primary ${!pending?.layout || errors.length ? 'disabled' : ''}`)}</div>`;
}
