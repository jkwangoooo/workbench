import { LOCAL_KEYS } from '../core/constants.js';
import { attr, button, empty, esc, head, panel } from '../core/dom.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';

export function resourcesPage() {
  const links = read(LOCAL_KEYS.resources, []);
  return (
    head('资源库', '常用网站与工作文件在本地分别管理。', button('添加网址', 'new-resource', 'primary')) +
    `<div class="local-tabs"><button type="button" class="${state.resourceTab === 'links' ? 'active' : ''}" data-resource-tab="links">常用网站</button><button type="button" class="${state.resourceTab === 'files' ? 'active' : ''}" data-resource-tab="files">工作文件</button></div>` +
    (state.resourceTab === 'links'
      ? panel(
          '常用网站',
          links.length
            ? `<div class="local-list">${links.map((item) => `<div class="local-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.category || '未分类')} · ${esc(item.note || '')}</small></div><a href="${attr(item.url)}" target="_blank" rel="noreferrer">打开</a>${button('删除', `delete-resource:${item.id}`, 'small danger')}</div>`).join('')}</div>`
            : empty('还没有常用网址'),
          'local-span-12'
        )
      : panel(
          '工作文件',
          `<div class="local-notice">工作文件本地功能预留；当前版本支持网址记录，文件批量上传和预览在后续本地迭代实现。</div>`,
          'local-span-12'
        ))
  );
}
