// 资源库页面（需求 §3 常用网站 / §4 工作文件）
//
// 两个独立标签页，数据也不互通：网址在 LOCAL_KEYS.resources（数组），
// 文件元数据在 LOCAL_KEYS.files（数组），二进制 Blob 在 IndexedDB。

import { LOCAL_KEYS } from '../core/constants.js';
import { fmtDateTime } from '../core/date.js';
import { attr, button, empty, esc, head, panel } from '../core/dom.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';
import { formatSize, isPreviewable, normalizeCategory } from '../domain/files.js';

/** 常用网站列表。 */
function linksPanel() {
  const links = read(LOCAL_KEYS.resources, []);
  const sorted = [...links].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), 'zh-CN');
  });
  return panel(
    '常用网站',
    sorted.length
      ? `<div class="local-list">${sorted
          .map(
            (item) =>
              `<div class="local-item"><div><strong>${esc(item.name)}${item.pinned ? ' <span class="local-pin">置顶</span>' : ''}</strong><small>${esc(item.category || '未分类')} · ${esc(item.note || '')}</small></div><a href="${attr(item.url)}" target="_blank" rel="noreferrer">打开</a>${button(item.pinned ? '取消置顶' : '置顶', `toggle-pin:${item.id}`, 'small')}${button('删除', `delete-resource:${item.id}`, 'small danger')}</div>`
          )
          .join('')}</div>`
      : empty('还没有常用网址'),
    'local-span-12'
  );
}

/** 待上传清单面板。 */
function uploadPanel() {
  const draft = state.fileDraft || [];
  const category = state.fileCategory || '';
  const rows = draft.length
    ? `<div class="local-todos">${draft
        .map(
          (item, i) =>
            `<div class="local-item"><div><strong>${esc(item.name)}</strong><small>${formatSize(item.size)} · ${esc(category || '未分类')}${item.error ? ` · <span class="local-error-text">${esc(item.error)}</span>` : ''}</small></div>${button('移除', `remove-file:${i}`, 'small danger')}</div>`
        )
        .join('')}</div>`
    : empty('还没有选择要上传的文件');

  const uploadButton = draft.length ? button('确认上传', 'confirm-upload', 'primary') : '';

  return panel(
    '上传工作文件',
    `<div class="local-field"><label>分类（可选）</label><input class="local-input" type="text" data-file-category value="${attr(category)}" placeholder="例如：教案、试卷、课件"></div><div class="local-field"><label>选择文件（可多选）</label><input type="file" data-file-input multiple></div>${rows}<div class="local-actions-row">${uploadButton}</div>`,
    'local-span-12'
  );
}

/** 文件列表面板。 */
function filesPanel() {
  const files = read(LOCAL_KEYS.files, []);
  const search = (state.fileSearch || '').trim().toLowerCase();
  const filterCat = normalizeCategory(state.fileCategory || '');

  const filtered = files.filter((f) => {
    if (search && !String(f.originalName).toLowerCase().includes(search)) return false;
    if (filterCat && normalizeCategory(f.category) !== filterCat) return false;
    return true;
  });

  const rows = filtered.length
    ? `<div class="local-list">${filtered
        .map((f) => {
          const previewable = isPreviewable(f.mimeType);
          const actions =
            (previewable ? button('预览', `preview-file:${f.id}`, 'small') : '') +
            button('下载', `download-file:${f.id}`, 'small') +
            button('删除', `delete-file:${f.id}`, 'small danger');
          return `<div class="local-item"><div><strong>${esc(f.originalName)}</strong><small>${formatSize(f.sizeBytes)} · ${esc(f.category || '未分类')} · ${esc(fmtDateTime(f.uploadedAt))}</small></div>${actions}</div>`;
        })
        .join('')}</div>`
    : empty(files.length ? '没有匹配的文件' : '还没有上传过文件');

  return panel(
    '工作文件',
    `<div class="local-field"><label>搜索文件名</label><input class="local-input" type="text" data-file-search value="${attr(state.fileSearch || '')}" placeholder="按文件名搜索"></div>${rows}`,
    'local-span-12'
  );
}

export function resourcesPage() {
  const tab = state.resourceTab || 'links';
  return (
    head('资源库', '常用网站与工作文件在本地分别管理。', tab === 'links' ? button('添加网址', 'new-resource', 'primary') : '') +
    `<div class="local-tabs"><button type="button" class="${tab === 'links' ? 'active' : ''}" data-resource-tab="links">常用网站</button><button type="button" class="${tab === 'files' ? 'active' : ''}" data-resource-tab="files">工作文件</button></div>` +
    (tab === 'links' ? linksPanel() : uploadPanel() + filesPanel())
  );
}
