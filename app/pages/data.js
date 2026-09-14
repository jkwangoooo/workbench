import { LOCAL_KEYS } from '../core/constants.js';
import { fmtDateTime } from '../core/date.js';
import { button, esc, head, panel } from '../core/dom.js';
import { state } from '../core/state.js';
import { read } from '../core/storage.js';
import { collectData, countRecords, rosterProfile } from '../domain/backup.js';
import { formatBytes, lastModifiedAt } from '../domain/data-health.js';

const RECORDS = [
  [LOCAL_KEYS.schedule, '课程表', '时段条目'],
  [LOCAL_KEYS.overrides, '临时调课', '时段条目'],
  [LOCAL_KEYS.todos, '待办事项', '条'],
  [LOCAL_KEYS.notes, '快捷记录', '条'],
  [LOCAL_KEYS.violations, '违纪记录', '条'],
  [LOCAL_KEYS.homework, '作业与反馈', '条'],
  [LOCAL_KEYS.interviews, '面谈记录', '条'],
  [LOCAL_KEYS.files, '工作文件', '个'],
  [LOCAL_KEYS.dictation, '听写阶段', '个'],
  [LOCAL_KEYS.tests, '单元测试', '次'],
  [LOCAL_KEYS.planning, '课程单元', '个'],
  [LOCAL_KEYS.resources, '常用网址', '条'],
  [LOCAL_KEYS.groupLayout, '分组表', '张'],
  [LOCAL_KEYS.seatingLayout, '座次表', '张']
];

// 分组表和座次表整份只算一张，不按内部字段数计。
const SINGLE_RECORDS = [LOCAL_KEYS.groupLayout, LOCAL_KEYS.seatingLayout];

// 作业反馈自 L2 起分成「作业」和「学生反馈」两张表，按条计数最贴近直觉；
// 旧备份里是 `班级:日期` → 学生 ID → 反馈 的两层键，按反馈条数算。
function homeworkCount(value) {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value.tasks) || Array.isArray(value.feedback)) return (value.tasks?.length || 0) + (value.feedback?.length || 0);
  return Object.values(value).reduce((sum, group) => sum + (group && typeof group === 'object' ? Object.keys(group).length : 0), 0);
}

// 面谈是记录数组，直接计条数。
function interviewCount(value) {
  if (!value || !Array.isArray(value.interviews)) return 0;
  return value.interviews.length;
}

function countFor(key, value) {
  if (key === LOCAL_KEYS.homework) return homeworkCount(value);
  if (key === LOCAL_KEYS.interviews) return interviewCount(value);
  return SINGLE_RECORDS.includes(key) ? (value ? 1 : 0) : countRecords(value);
}

function countTable(data, countLabel) {
  const counts = RECORDS.map(([key, label, unit]) => {
    const value = data[key];
    const lastModified = lastModifiedAt(value);
    const bytes = value === null || value === undefined ? 0 : JSON.stringify(value).length * 2;
    return {
      label,
      unit,
      count: countFor(key, value),
      lastModified: lastModified ? fmtDateTime(new Date(lastModified).toISOString()) : '—',
      bytes
    };
  });
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const totalBytes = counts.reduce((sum, item) => sum + item.bytes, 0);
  const rows = counts
    .map(
      (item) =>
        `<tr><td>${esc(item.label)}</td><td>${item.count}</td><td>${esc(item.unit)}</td><td>${esc(item.lastModified)}</td><td>${esc(formatBytes(item.bytes))}</td></tr>`
    )
    .join('');
  return `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>数据分类</th><th>${esc(countLabel)}</th><th>单位</th><th>最后修改</th><th>占用</th></tr></thead><tbody>${rows}<tr><td><strong>合计</strong></td><td><strong>${total}</strong></td><td></td><td></td><td><strong>${esc(formatBytes(totalBytes))}</strong></td></tr></tbody></table></div>`;
}

function rosterCheck(backupRoster) {
  const current = rosterProfile();
  if (!backupRoster || backupRoster.fingerprint === undefined) {
    return '<div class="local-notice">这份备份没有记录学生名单信息，无法自动核对，请自行确认本机名单与备份来源一致。</div>';
  }
  if (backupRoster.fingerprint === current.fingerprint) {
    return `<div class="local-notice">学生名单核对通过：备份与本机都是 8 班 ${current.count8} 人、7 班 ${current.count7} 人。</div>`;
  }
  const backup8 = Number(backupRoster.count8) || 0;
  const backup7 = Number(backupRoster.count7) || 0;
  return `<div class="local-error">学生名单不一致：备份里是 8 班 ${backup8} 人、7 班 ${backup7} 人，本机是 8 班 ${current.count8} 人、7 班 ${current.count7} 人。此时恢复可能让历史记录对不上人，请先确认本机的学生种子文件和备份来源一致。</div>`;
}

function restorePreview(pending) {
  const { backup, ignored = [] } = pending;
  return (
    `<div class="local-notice">备份导出时间：${esc(fmtDateTime(backup.exportedAt) || '文件未记录')}。确认后会用它覆盖当前全部工作记录，且无法撤销。</div>` +
    countTable(backup.data, '备份内记录数') +
    rosterCheck(backup.roster) +
    (ignored.length ? `<div class="local-notice">已忽略 ${ignored.length} 个无法识别的数据键：${esc(ignored.join('、'))}</div>` : '') +
    `<div class="local-actions-row">${button('取消', 'cancel-restore')}${button('确认恢复（覆盖当前数据）', 'confirm-restore', 'primary')}</div>`
  );
}

function restorePicker() {
  return (
    '<div class="local-notice">恢复会用备份里的数据覆盖当前全部工作记录。恢复前建议先导出一份当前数据作为保险。</div>' +
    '<div class="local-field"><label>选择备份文件（.json）</label><input class="local-input" type="file" data-backup-file accept=".json,application/json"></div>'
  );
}

function restorePanelBody() {
  const pending = state.pendingBackup;
  if (!pending) return restorePicker();
  if (pending.errors?.length) {
    return `<div class="local-error">${pending.errors.map((message) => `<div>${esc(message)}</div>`).join('')}</div>${restorePicker()}`;
  }
  return restorePreview(pending);
}

export function dataPage() {
  const meta = read(LOCAL_KEYS.meta, {}) || {};
  const backupState = meta.lastExportedAt ? `上次导出：${fmtDateTime(meta.lastExportedAt)}` : '还没有导出过备份';
  return (
    head(
      '数据与备份',
      '数据只保存在当前浏览器，不连接云端。换设备、重装系统或清理浏览器缓存前，请先导出备份。',
      button('导出全部数据', 'export-backup', 'primary')
    ) +
    panel(
      '备份状态',
      `<div class="local-notice">${esc(backupState)}。备份是单个 JSON 文件，包含下表全部工作记录。学生名单不在备份里（名单来自本机的私有种子文件），请连同名单文件一起保存。</div>`,
      'local-span-12'
    ) +
    panel('数据概览', countTable(collectData(), '记录数'), 'local-span-12') +
    panel('恢复备份', restorePanelBody(), 'local-span-12')
  );
}
