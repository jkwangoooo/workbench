import { LOCAL_KEYS } from '../core/constants.js';
import { attr, button, esc, head, panel } from '../core/dom.js';
import { read } from '../core/storage.js';
import { prepWorkflowUrl } from '../domain/prep.js';

export function prepPage() {
  const raw = read(LOCAL_KEYS.prep, '');
  const result = prepWorkflowUrl(raw);
  const status = result.configured
    ? `<div class="local-notice">已配置：<code>${esc(result.url)}</code>。点击下方按钮在新标签页打开备课中心。</div>`
    : `<div class="local-notice">尚未配置备课中心地址，或地址不合法。请填入有效的 <code>https://</code> 地址。</div>`;

  const openButton = result.configured
    ? button('打开备课中心', 'open-prep', 'primary')
    : `<button type="button" class="local-button primary disabled" disabled>打开备课中心</button>`;

  return (
    head('备课中心', '独立网页入口，不共享本地工作台数据。') +
    panel(
      '备课中心',
      status +
        openButton +
        `<div class="local-field" style="margin-top:12px"><label>备课中心地址（https://）</label><input class="local-input" type="url" data-prep-url value="${attr(raw)}" placeholder="https://your-prep-workflow.example.com"></div><div class="local-actions-row">${button('保存配置', 'save-prep', 'small')}</div>`,
      'local-span-12'
    )
  );
}
