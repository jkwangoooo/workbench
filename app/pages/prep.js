import { head, panel } from '../core/dom.js';

export function prepPage() {
  return (
    head('备课中心', '独立网页入口，不共享本地工作台数据。') +
    panel('备课中心', `<div class="local-notice">尚未配置备课中心地址。配置完成后将在新标签页打开。</div>`, 'local-span-12')
  );
}
