import { createStudentRepository } from './modules/class-management/data/studentRepository.js';
import { ClassManagementPage } from './modules/class-management/pages/ClassManagementPage.js';
import { createGroupLayoutRepository } from './modules/class-management/data/groupLayoutRepository.js';
import { createSeatingLayoutRepository } from './modules/class-management/data/seatingLayoutRepository.js';
import { createSupabaseRestClient } from './shared/database/client.js';

export const runtimeBaseline = 'legacy-static-prototype';

declare global { interface Window { ClassManagement?: { mount(root: HTMLElement): void }; XLSX?: { read(data: ArrayBuffer, options: { type: 'array' }): { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json(sheet: unknown, options: { header: 1; defval: string }): unknown[][]; aoa_to_sheet(rows: unknown[][]): unknown; book_new(): unknown; book_append_sheet(book: unknown, sheet: unknown, name: string): void }; write(book: unknown, options: { bookType: 'xlsx'; type: 'array' }): ArrayBuffer }; } }

function mount(root: HTMLElement) {
  const config = JSON.parse(localStorage.getItem('teacher-cloud-config') || 'null') as { url?: string; publishableKey?: string } | null;
  const session = JSON.parse(localStorage.getItem('teacher-cloud-session') || 'null') as { access_token?: string } | null;
  if (!config?.url || !config.publishableKey || !session?.access_token) {
    root.innerHTML = '<section class="panel panel-pad"><div class="empty">请先在云端设置中登录工作台账号。</div></section>';
    return;
  }
  const repository = createStudentRepository(createSupabaseRestClient({ url: config.url, publishableKey: config.publishableKey, accessToken: session.access_token }));
  const client = createSupabaseRestClient({ url: config.url, publishableKey: config.publishableKey, accessToken: session.access_token });
  void new ClassManagementPage(root, repository, createGroupLayoutRepository(client), createSeatingLayoutRepository(client)).mount().catch(() => { root.innerHTML = '<section class="panel panel-pad"><div class="empty">学生目录暂时无法读取，请检查网络连接或重新登录。</div></section>'; });
}

window.ClassManagement = { mount };
