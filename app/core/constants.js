export const LOCAL_KEYS = {
  schedule: 'teacher-local-schedule',
  overrides: 'teacher-local-schedule-overrides',
  todos: 'teacher-local-todos',
  notes: 'teacher-local-notes',
  violations: 'teacher-local-violations',
  homework: 'teacher-local-homework',
  dictation: 'teacher-local-dictation',
  tests: 'teacher-local-tests',
  planning: 'teacher-local-planning',
  resources: 'teacher-local-resources',
  groupLayout: 'teacher-local-group-layout',
  seatingLayout: 'teacher-local-seating-layout',
  meta: 'teacher-local-meta',
  interviews: 'teacher-local-interviews'
};

// 备份白名单：只有登记在这里的键会随「导出备份」走，导入时也只恢复这些键。
// tests/unit/local-app-backup.test.mjs 会校验每个 LOCAL_KEYS 都已被登记。
export const EXPORT_KEYS = [
  LOCAL_KEYS.schedule,
  LOCAL_KEYS.overrides,
  LOCAL_KEYS.todos,
  LOCAL_KEYS.notes,
  LOCAL_KEYS.violations,
  LOCAL_KEYS.homework,
  LOCAL_KEYS.dictation,
  LOCAL_KEYS.tests,
  LOCAL_KEYS.planning,
  LOCAL_KEYS.resources,
  LOCAL_KEYS.groupLayout,
  LOCAL_KEYS.seatingLayout,
  LOCAL_KEYS.interviews
];

// 仅本机有效、刻意不随备份迁移的键（迁移标记、上次导出时间等）。
export const LOCAL_ONLY_KEYS = [LOCAL_KEYS.meta];

export const weekdays = ['周一', '周二', '周三', '周四', '周五'];
export const class8Name = '2025级8班';
export const class7Name = '2025级7班';
export const slots = ['早读', '第1节', '第2节', '第3节', '第4节', '午休', '第5节', '第6节', '第7节', '第8节', '课辅A', '课辅B', '课辅C'];
