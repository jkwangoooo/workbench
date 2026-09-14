import { class8Name } from '../core/constants.js';
import { button, empty, esc, head, panel, toast } from '../core/dom.js';
import { state } from '../core/state.js';
import { buildGroupTemplateCsv } from '../domain/group-template.js';
import { buildSeatingTemplateCsv } from '../domain/seating-template.js';

export function layoutPage(kind) {
  const isGroup = kind === 'groups';
  const layout = isGroup ? state.groupLayout : state.seatingLayout;
  const title = isGroup ? '分组表' : '座次表';
  const actions = `${button('下载模板', `download-${kind}`, 'small')}${button('上传模板', `import-${kind}`, 'primary')}${layout ? button('打印', `print-${kind}`, 'small') : ''}`;
  const body = layout ? (isGroup ? groupPreview(layout) : seatingPreview(layout)) : empty(`还没有已确认的${title}`);
  return (
    head(title, `固定模板导入、预览后确认；确认后才替换当前${title}。`, actions) +
    `<div class="local-notice">上传不会立即覆盖已保存布局。错误或取消会保留旧布局。</div>${panel(`当前${title}`, body, 'local-span-12')}`
  );
}
export function groupPreview(layout) {
  return `<div class="local-list">${layout.groups.map((group) => `<div class="local-group-row"><strong>第${group.groupIndex}组</strong>${group.members.length ? group.members.map((member) => `<span class="local-chip ${member.isLeader ? 'leader' : ''}">${esc(member.displayName)}${member.isLeader ? ' · 组长' : ''}</span>`).join('') : '<span class="local-muted">暂无成员</span>'}</div>`).join('')}</div>`;
}
export function seatingPreview(layout) {
  return `<div class="local-layout-grid" style="grid-template-columns:repeat(${layout.columnCount},minmax(55px,1fr))">${layout.cells.map((cell) => `<div class="local-seat ${cell.cellKind}">${cell.cellKind === 'student' ? esc(cell.displayName) : cell.cellKind === 'aisle' ? '过道' : cell.cellKind === 'podium' ? '讲台' : '空座'}</div>`).join('')}</div>`;
}

export function downloadTemplate(kind) {
  const content = kind === 'groups' ? buildGroupTemplateCsv() : buildSeatingTemplateCsv();
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = kind === 'groups' ? 'group-layout-v1.csv' : 'seating-layout-v1.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}
export function printLayout(kind) {
  const layout = kind === 'groups' ? state.groupLayout : state.seatingLayout;
  if (!layout) return;
  const title = kind === 'groups' ? `${class8Name} 分组表` : `${class8Name} 座次表`;
  const printWindow = window.open('', '_blank');
  if (!printWindow) return toast('浏览器阻止了打印窗口');
  printWindow.document.write(
    `<html><head><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#17212b}h1{font-size:22px;font-weight:600;margin:0 0 18px}.group{display:flex;gap:8px;align-items:center;border-bottom:1px solid #dce3e7;padding:10px 0}.group strong{width:70px}.chip{border:1px solid #ccd7dc;padding:6px 9px}.grid{display:grid;grid-template-columns:repeat(9,1fr);gap:5px}.seat{min-height:38px;border:1px solid #ccd7dc;display:grid;place-items:center;font-size:12px}.podium{background:#dceeff;font-weight:bold}.aisle{background:#f0f2f3;color:#67737c}.empty{background:#fafbfb;color:#a0aab1}</style></head><body><h1>${esc(title)}</h1>${kind === 'groups' ? layout.groups.map((group) => `<div class="group"><strong>第${group.groupIndex}组</strong>${group.members.map((member) => `<span class="chip">${esc(member.displayName)}${member.isLeader ? ' · 组长' : ''}</span>`).join('')}</div>`).join('') : `<div class="grid">${layout.cells.map((cell) => `<div class="seat ${cell.cellKind}">${cell.cellKind === 'student' ? esc(cell.displayName) : cell.cellKind === 'aisle' ? '过道' : cell.cellKind === 'podium' ? '讲台' : '空座'}</div>`).join('')}</div>`}</body></html>`
  );
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
