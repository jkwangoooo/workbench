const app = document.querySelector('#app');
const savedCloudConfig = JSON.parse(localStorage.getItem('teacher-cloud-config') || 'null');

const periods = ['早读', '第一节', '第二节', '第三节', '第四节', '午休', '第五节', '第六节', '第七节', '第八节', '课辅 A 组', '课辅 B 组', '课辅 C 组'];
const weekdays = ['周一', '周二', '周三', '周四', '周五'];
const teacherPeriods = periods.slice(0, 10).concat('课辅');
let seedClasses = [];
let seedLoadPromise = null;
let roster8 = [];
let roster7 = [];

const today = new Date().toISOString().slice(0, 10);

const state = {
  page: 'dashboard',
  classId: '8',
  scheduleType: 'class',
  temporaryDate: today,
  schedule: JSON.parse(localStorage.getItem('teacher-schedule') || '{}'),
  scheduleCells: {},
  todos: [],
  notes: [],
  violations: [],
  resources: JSON.parse(localStorage.getItem('teacher-resources') || 'null') || [
    { name: '国家中小学智慧教育平台', url: 'https://basic.smartedu.cn/' },
    { name: '山东省教育资源公共服务平台', url: 'https://www.sdedu.gov.cn/' }
  ],
  studentsFilter: '',
  selectedStudent: 0,
  homeworkClass: '8',
  homeworkDate: today,
  homeworkBatchId: null,
  feedback: {},
  dictationSheets: [],
  dictationSelectedSheetId: null,
  dictationColumns: [],
  dictationTargets: {},
  dictationScores: {},
  testSheets: [],
  testSelectedSheetId: null,
  testScores: {},
  testRankReferences: {},
  session: JSON.parse(localStorage.getItem('teacher-cloud-session') || 'null'),
  studentsStatus: 'signed-out',
  cloudClasses: [],
  scheduleOverrides: {},
  scheduleOverridesDirty: false,
  scheduleSaveState: 'idle',
  scheduleSaveMessage: ''
};
let cloudRefreshPromise = null;
let scheduleCellCreateTemplate = null;
let scheduleCellCreateTemplateType = null;

function cloudConfig() {
  return JSON.parse(localStorage.getItem('teacher-cloud-config') || 'null');
}
function recoveryAccessToken() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get('type') === 'recovery' ? params.get('access_token') : null;
}
function clearRecoveryUrl() {
  window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
}
function cloudHeaders(extra = {}) {
  const config = cloudConfig();
  if (!config?.url || !config?.publishableKey) throw new Error('请先保存 Supabase 连接配置');
  return {
    apikey: config.publishableKey,
    Authorization: `Bearer ${state.session?.access_token || config.publishableKey}`,
    'Content-Type': 'application/json',
    ...extra
  };
}
async function refreshCloudSession() {
  if (cloudRefreshPromise) return cloudRefreshPromise;
  cloudRefreshPromise = (async () => {
  const config = cloudConfig();
  const refreshToken = state.session?.refresh_token;
  if (!config?.url || !config?.publishableKey || !refreshToken) throw new Error('云端登录已过期，请重新登录工作台账号');
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const data = await response.json();
  if (!response.ok) {
    state.session = null;
    localStorage.removeItem('teacher-cloud-session');
    throw new Error('云端登录已过期，请重新登录工作台账号');
  }
  state.session = { ...data, refresh_token: data.refresh_token || refreshToken };
  localStorage.setItem('teacher-cloud-session', JSON.stringify(state.session));
  return state.session;
  })();
  try {
    return await cloudRefreshPromise;
  } finally {
    cloudRefreshPromise = null;
  }
}
async function cloudRequest(path, options = {}, allowRefresh = true) {
  const config = cloudConfig();
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: cloudHeaders(options.headers),
    body: options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status === 401 && allowRefresh && state.session?.refresh_token) {
    await refreshCloudSession();
    return cloudRequest(path, options, false);
  }
  if (!response.ok) {
    const detail = [data?.message, data?.hint, data?.details, data?.code].filter(Boolean).join(' | ');
    throw new Error(detail || '云端请求失败');
  }
  return data;
}
async function cloudLogin(email, password) {
  const config = cloudConfig();
  if (!config?.url || !config?.publishableKey) throw new Error('请先保存 Supabase 连接配置');
  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error_description || '登录失败');
  state.session = data;
  localStorage.setItem('teacher-cloud-session', JSON.stringify(data));
  await loadCloudStudents();
  await loadCloudWorkspaceData();
}
async function updateRecoveryPassword(password) {
  const config = cloudConfig();
  const accessToken = recoveryAccessToken();
  if (!config?.url || !config?.publishableKey) throw new Error('请先在此浏览器保存 Supabase 连接配置');
  if (!accessToken) throw new Error('恢复链接无效或已过期，请重新发送密码恢复邮件');
  const response = await fetch(`${config.url}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.message || data?.error_description || '密码更新失败');
}
async function loadCloudStudents() {
  roster8 = [];
  roster7 = [];
  if (!state.session?.access_token) { state.studentsStatus = 'signed-out'; return; }
  state.studentsStatus = 'loading';
  try {
    const classes = await cloudRequest('classes?select=id,name,teacher_role&order=name');
    state.cloudClasses = classes;
    const students = await cloudRequest('students?select=id,name,identity_number,provincial_student_number,exam_number,profile,sort_order,class_id&order=sort_order');
    const asView = (student) => {
      const profile = student.profile && typeof student.profile === 'object' && !Array.isArray(student.profile) ? student.profile : {};
      return {
        studentId: student.id,
        name: student.name,
        id: student.identity_number || profile['学生身份证号'] || '',
        provincial: student.provincial_student_number || '',
        exam: student.exam_number || '',
        gender: profile['请选择性别'] || '',
        profile
      };
    };
    const class8 = classes.find((item) => item.name === '2025级8班');
    const class7 = classes.find((item) => item.name === '2025级7班');
    if (class8) roster8 = students.filter((item) => item.class_id === class8.id).map(asView);
    if (class7) roster7 = students.filter((item) => item.class_id === class7.id).map(asView);
    state.studentsStatus = roster8.length || roster7.length ? 'ready' : 'empty';
  } catch (error) {
    state.cloudClasses = [];
    state.studentsStatus = 'error';
    throw error;
  }
}
async function uploadSeedStudents() {
  if (!state.session?.access_token) throw new Error('请先登录云端账号');
  await loadSeedClasses();
  if (!seedClasses.length) throw new Error('本机没有可导入的学生数据');
  for (const classData of seedClasses) {
    const result = await cloudRequest('classes?on_conflict=owner_id,name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ name: classData.name, teacher_role: classData.teacherRole })
    });
    const classId = result?.[0]?.id;
    if (!classId) throw new Error(`${classData.name} 导入失败`);
    const records = classData.students.map((student) => ({
      class_id: classId,
      name: student.name,
      identity_number: student.identityNumber || null,
      provincial_student_number: student.provincialStudentNumber || null,
      exam_number: student.examNumber || null,
      profile: student.profile || {},
      sort_order: student.sortOrder || 0
    }));
    await cloudRequest('students?on_conflict=owner_id,class_id,name', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(records)
    });
  }
  await loadCloudStudents();
  await loadCloudWorkspaceData();
}
function loadSeedClasses() {
  if (seedClasses.length) return Promise.resolve();
  if (seedLoadPromise) return seedLoadPromise;
  seedLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = './private-data/students.js';
    script.onload = () => { seedClasses = window.WORKBENCH_SEED?.classes || []; resolve(); };
    script.onerror = () => reject(new Error('本机私有导入数据不可用'));
    document.head.append(script);
  }).finally(() => { seedLoadPromise = null; });
  return seedLoadPromise;
}

function requireCloudSession() {
  if (!state.session?.access_token) throw new Error('请先登录云端账号');
}
function isSchemaFieldError(error) {
  return /schema cache|column .* (?:does not exist|not found)|could not find the .* column/i.test(error?.message || '');
}
function missingSchemaField(error) {
  const message = error?.message || '';
  return message.match(/could not find the ['"]([^'"]+)['"] column/i)?.[1]
    || message.match(/column ['"]?([a-z_][a-z0-9_]*)['"]? .* (?:does not exist|not found)/i)?.[1]
    || null;
}
async function createWithSchemaFallback(endpoint, variants) {
  let lastError;
  const pending = [...variants];
  while (pending.length) {
    const body = pending.shift();
    try {
      return await cloudRequest(endpoint, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(body)
      });
    } catch (error) {
      lastError = error;
      if (!isSchemaFieldError(error) && !/null value in column|not-null constraint/i.test(error.message || '')) throw error;
      const missingField = missingSchemaField(error);
      if (missingField && Object.prototype.hasOwnProperty.call(body, missingField)) {
        const retryBody = { ...body };
        delete retryBody[missingField];
        pending.unshift(retryBody);
      }
    }
  }
  throw lastError || new Error('云端记录创建失败');
}
function asTodo(row) {
  return { id: row.id, text: row.content, due: row.deadline, done: row.completed, createdAt: row.created_at };
}
function asNote(row) {
  return { id: row.id, text: row.content, createdAt: row.created_at };
}
function cloudClass(name) {
  return state.cloudClasses.find((item) => item.name === name);
}
function overrideKey(date, slot) {
  return `${date}::${slot}`;
}
function temporarySlot(day, period) {
  return `${day}-${period}`;
}
function weekdayForDate(date) {
  const day = new Date(`${date}T00:00:00`).getDay();
  return day === 0 || day === 6 ? null : weekdays[day - 1];
}
function isTemporarySchedule(type) {
  return type.startsWith('temporary-');
}
async function loadCloudTodos() {
  if (!state.session?.access_token) { state.todos = []; return; }
  const rows = await cloudRequest('todos?select=id,content,deadline,completed,created_at&order=deadline.asc,created_at.desc');
  state.todos = rows.map(asTodo);
}
async function loadCloudNotes() {
  if (!state.session?.access_token) { state.notes = []; return; }
  const rows = await cloudRequest('quick_notes?select=id,content,created_at&order=created_at.desc');
  state.notes = rows.map(asNote);
}
async function loadCloudViolations() {
  if (!state.session?.access_token) { state.violations = []; return; }
  const class8 = cloudClass('2025级8班');
  if (!class8) { state.violations = []; return; }
  const studentsById = new Map(roster8.map((student) => [student.studentId, student.name]));
  const rows = await cloudRequest(`violations?select=id,student_id,event_date,content&class_id=eq.${class8.id}&order=event_date.desc,created_at.desc`);
  state.violations = rows.map((row) => ({ id: row.id, date: row.event_date, studentId: row.student_id, student: studentsById.get(row.student_id) || '学生资料不可用', text: row.content }));
}
async function loadCloudHomeworkFeedback() {
  state.homeworkBatchId = null;
  state.feedback = {};
  if (!state.session?.access_token) return;
  const classRecord = cloudClass(className(state.homeworkClass));
  if (!classRecord) return;
  const batches = await cloudRequest(`homework_batches?select=id,homework_date,created_at&class_id=eq.${classRecord.id}&homework_date=eq.${state.homeworkDate}&order=created_at.desc`);
  const batch = batches[0];
  if (!batch) return;
  state.homeworkBatchId = batch.id;
  const rows = await cloudRequest(`homework_feedback?select=id,student_id,rating,note&batch_id=eq.${batch.id}`);
  state.feedback = Object.fromEntries(rows.map((row) => [row.student_id, { id: row.id, rating: row.rating || '优', note: row.note || '' }]));
}

function asDictationSheet(row) {
  return { id: row.id, classId: row.class_id, name: row.stage_name || row.name || row.title || row.stage || '未命名阶段', createdAt: row.created_at };
}
function asDictationColumn(row) {
  return {
    id: row.id,
    sheetId: row.sheet_id,
    date: row.column_date || row.dictation_date || row.date || '',
    name: row.dictation_name || row.column_name || row.name || row.title || row.label || '听写',
    sortOrder: Number(row.sort_order || 0)
  };
}
function dictationScoreKey(targetId, columnId) { return `${targetId}:${columnId}`; }
async function loadCloudDictationSheet() {
  state.dictationColumns = [];
  state.dictationTargets = {};
  state.dictationScores = {};
  if (!state.session?.access_token || !state.dictationSelectedSheetId) return;
  const sheetId = state.dictationSelectedSheetId;
  const [columnRows, targetRows] = await Promise.all([
    cloudRequest(`dictation_columns?select=*&sheet_id=eq.${sheetId}&order=sort_order.asc`),
    cloudRequest(`dictation_targets?select=*&sheet_id=eq.${sheetId}`)
  ]);
  state.dictationColumns = columnRows.map(asDictationColumn);
  state.dictationTargets = Object.fromEntries(targetRows.map((row) => [row.student_id, {
    id: row.id,
    studentId: row.student_id,
    targetScore: row.target_score === null || row.target_score === undefined ? '' : row.target_score
  }]));
  const targetIds = targetRows.map((row) => row.id).filter(Boolean);
  if (!targetIds.length) return;
  const scoreRows = await cloudRequest(`dictation_scores?select=*&target_id=in.(${targetIds.join(',')})`);
  state.dictationScores = Object.fromEntries(scoreRows.map((row) => [dictationScoreKey(row.target_id, row.column_id), {
    id: row.id,
    targetId: row.target_id,
    columnId: row.column_id,
    score: row.score === null || row.score === undefined ? '' : row.score
  }]));
}
async function loadCloudDictation() {
  state.dictationSheets = [];
  state.dictationSelectedSheetId = null;
  state.dictationColumns = [];
  state.dictationTargets = {};
  state.dictationScores = {};
  if (!state.session?.access_token) return;
  const classRecord = cloudClass(className(state.classId));
  if (!classRecord) return;
  const rows = await cloudRequest(`dictation_sheets?select=*&class_id=eq.${classRecord.id}`);
  state.dictationSheets = rows.map(asDictationSheet);
  state.dictationSelectedSheetId = state.dictationSheets[0]?.id || null;
  await loadCloudDictationSheet();
}
function asTestSheet(row) {
  return { id: row.id, classId: row.class_id, name: row.test_name || row.name || row.title || '未命名测试', date: row.test_date || row.exam_date || row.date || '', createdAt: row.created_at };
}
async function loadCloudTestSheet() {
  state.testScores = {};
  state.testRankReferences = {};
  if (!state.session?.access_token || !state.testSelectedSheetId) return;
  const sheetId = state.testSelectedSheetId;
  const [scoreRows, referenceRows] = await Promise.all([
    cloudRequest(`test_scores?select=*&sheet_id=eq.${sheetId}`),
    cloudRequest(`test_rank_references?select=*&sheet_id=eq.${sheetId}`)
  ]);
  state.testScores = Object.fromEntries(scoreRows.map((row) => [row.student_id, {
    id: row.id,
    studentId: row.student_id,
    score: row.score === null || row.score === undefined ? '' : row.score,
    currentRank: row.current_rank ?? row.rank ?? ''
  }]));
  state.testRankReferences = Object.fromEntries(referenceRows.map((row) => [row.student_id, {
    id: row.id,
    studentId: row.student_id,
    rank: row.reference_rank ?? row.rank ?? ''
  }]));
}
async function loadCloudTests() {
  state.testSheets = [];
  state.testSelectedSheetId = null;
  state.testScores = {};
  state.testRankReferences = {};
  if (!state.session?.access_token) return;
  const classRecord = cloudClass(className(state.classId));
  if (!classRecord) return;
  const rows = await cloudRequest(`test_sheets?select=*&class_id=eq.${classRecord.id}`);
  state.testSheets = rows.map(asTestSheet);
  state.testSelectedSheetId = state.testSheets[0]?.id || null;
  await loadCloudTestSheet();
}
function testRankRows() {
  const scored = rowsForClass(state.classId).map((student) => {
    const raw = state.testScores[student.studentId]?.score ?? '';
    const score = validScore(raw);
    return { student, score: Number.isNaN(score) ? null : score };
  }).filter((item) => item.score !== null).sort((a, b) => b.score - a.score);
  let previousScore = null;
  let previousRank = 0;
  const ranks = new Map();
  scored.forEach((item, index) => {
    if (item.score !== previousScore) previousRank = index + 1;
    ranks.set(item.student.studentId, previousRank);
    previousScore = item.score;
  });
  return rowsForClass(state.classId).map((student) => {
    const score = state.testScores[student.studentId]?.score ?? '';
    const rank = ranks.get(student.studentId) || '';
    const reference = state.testRankReferences[student.studentId]?.rank ?? '';
    return { student, score, rank, reference };
  });
}
async function createCloudTestSheet(name, date) {
  requireCloudSession();
  const classRecord = cloudClass(className(state.classId));
  if (!classRecord) throw new Error('未读取到当前班级云端信息，请重新登录后再试');
  const displayName = date ? `${name}（${date}）` : name;
  const rows = await createWithSchemaFallback('test_sheets', [
    { class_id: classRecord.id, test_name: displayName },
    { class_id: classRecord.id, name: displayName },
    { class_id: classRecord.id, title: displayName }
  ]);
  const sheet = rows[0];
  if (!sheet?.id) throw new Error('单元测试表创建失败');
  await loadCloudTests();
  state.testSelectedSheetId = sheet.id;
  await loadCloudTestSheet();
}
async function saveCloudTests() {
  requireCloudSession();
  const roster = rowsForClass(state.classId);
  if (!state.testSelectedSheetId || !roster.length) throw new Error('请先选择测试表并读取学生资料');
  const rankedRows = testRankRows();
  const writes = [];
  for (const item of rankedRows) {
    const current = state.testScores[item.student.studentId];
    const score = validScore(item.score);
    if (Number.isNaN(score)) throw new Error(`${item.student.name} 的成绩需填写 0-100 的数字`);
    if (score === null) {
      if (current?.id) writes.push(cloudRequest(`test_scores?id=eq.${current.id}`, { method: 'DELETE' }));
      continue;
    }
    const record = { score, current_rank: item.rank || null };
    if (current?.id) writes.push(cloudRequest(`test_scores?id=eq.${current.id}`, { method: 'PATCH', body: JSON.stringify(record) }));
    else writes.push(cloudRequest('test_scores', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sheet_id: state.testSelectedSheetId, student_id: item.student.studentId, ...record }) }));
  }
  for (const item of rankedRows) {
    const reference = state.testRankReferences[item.student.studentId];
    const rank = validRank(item.reference);
    if (rank === null) {
      if (reference?.id) writes.push(cloudRequest(`test_rank_references?id=eq.${reference.id}`, { method: 'DELETE' }));
      continue;
    }
    const record = { reference_rank: rank };
    if (reference?.id) writes.push(cloudRequest(`test_rank_references?id=eq.${reference.id}`, { method: 'PATCH', body: JSON.stringify(record) }));
    else writes.push(cloudRequest('test_rank_references', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sheet_id: state.testSelectedSheetId, student_id: item.student.studentId, ...record }) }));
  }
  await Promise.all(writes);
  await loadCloudTestSheet();
}
function validRank(value) {
  if (value === '' || value === null || value === undefined) return null;
  const rank = Number(value);
  return Number.isInteger(rank) && rank > 0 ? rank : NaN;
}
async function loadCloudScheduleOverrides() {
  state.scheduleOverrides = {};
  state.scheduleOverridesDirty = false;
  if (!state.session?.access_token) return;
  const class8 = cloudClass('2025级8班');
  if (!class8) return;
  const rows = await cloudRequest(`schedule_overrides?select=id,schedule_date,slot,note&scope=eq.class&class_id=eq.${class8.id}&schedule_date=eq.${state.temporaryDate}`);
  state.scheduleOverrides = Object.fromEntries(rows.map((row) => [overrideKey(row.schedule_date, row.slot), row]));
}
function scheduleCellType(row) {
  const raw = row.scope || row.schedule_type || row.type || row.kind || '';
  if (/teacher|教师|我的/i.test(String(raw))) return 'teacher';
  if (/class|班级|8班/i.test(String(raw))) return 'class';
  return row.class_id || row.class_name ? 'class' : 'teacher';
}
function scheduleCellDay(row) {
  const raw = row.day_of_week ?? row.weekday ?? row.day ?? row.week ?? '';
  const numeric = Number(raw);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= weekdays.length ? weekdays[numeric - 1] : raw;
}
function scheduleCellPeriod(row, type = 'class') {
  const raw = row.period ?? row.slot ?? row.period_name ?? row.lesson ?? '';
  const numeric = Number(raw);
  if (!Number.isInteger(numeric)) return raw;
  if (type === 'teacher' && numeric === 11) return '课辅';
  return numeric >= 1 && numeric <= periods.length ? periods[numeric - 1] : raw;
}
function scheduleCellValue(row) {
  const field = ['content', 'note', 'value', 'course', 'subject', 'label', 'text'].find((key) => row[key] !== null && row[key] !== undefined);
  return field ? String(row[field] ?? '') : '';
}
function scheduleCellValueField(row) {
  return ['content', 'note', 'value', 'course', 'subject', 'label', 'text'].find((key) => row[key] !== null && row[key] !== undefined) || 'content';
}
function scheduleCellKey(type, day, period) {
  return `${type}-${day}-${period}`;
}
function scheduleDayNumber(day) {
  const index = weekdays.indexOf(day);
  return index >= 0 ? index + 1 : day;
}
function schedulePeriodNumber(period) {
  const index = periods.indexOf(period);
  return index >= 0 ? index + 1 : period === '课辅' ? 11 : period;
}
function normalizeSchedulePayload(payload) {
  const normalized = { ...payload };
  ['day_of_week', 'weekday', 'day', 'week'].forEach((field) => {
    if (typeof normalized[field] === 'string') normalized[field] = scheduleDayNumber(normalized[field]);
  });
  ['period', 'slot', 'period_name', 'lesson'].forEach((field) => {
    if (typeof normalized[field] === 'string') normalized[field] = schedulePeriodNumber(normalized[field]);
  });
  return normalized;
}
function isScheduleCellRetryable(error) {
  return isSchemaFieldError(error) || /check constraint|violates .*constraint|invalid input syntax/i.test(error?.message || '');
}
async function loadCloudScheduleCells() {
  state.scheduleCells = {};
  if (!state.session?.access_token) return;
  const rows = await cloudRequest('schedule_cells?select=*');
  const cloudSchedule = {};
  rows.forEach((row) => {
    const type = scheduleCellType(row);
    const day = scheduleCellDay(row);
    const period = scheduleCellPeriod(row, type);
    if (!day || !period || !weekdays.includes(day)) return;
    const key = scheduleCellKey(type, day, period);
    state.scheduleCells[key] = row;
    cloudSchedule[key] = scheduleCellValue(row);
  });
  if (Object.keys(cloudSchedule).length) {
    state.schedule = { ...state.schedule, ...cloudSchedule };
    save('teacher-schedule', state.schedule);
  }
}
function scheduleCellVariants(type, day, period, value) {
  const classRecord = cloudClass('2025级8班');
  // schedule_cells_scope_check distinguishes class and personal schedules. Keep the
  // semantic scope stable; only position/value field names remain schema-compatible.
  const scopeVariants = type === 'class'
    ? [{ scope: 'class', class_id: classRecord.id }]
    : [{ scope: 'personal' }];
  const positionVariants = [
    { day_of_week: scheduleDayNumber(day), period: schedulePeriodNumber(period) },
    { weekday: scheduleDayNumber(day), period: schedulePeriodNumber(period) },
    { day: scheduleDayNumber(day), slot: schedulePeriodNumber(period) },
    { weekday: scheduleDayNumber(day), slot: schedulePeriodNumber(period) },
    { day_of_week: scheduleDayNumber(day), slot: schedulePeriodNumber(period) },
    { day: scheduleDayNumber(day), period: schedulePeriodNumber(period) }
  ];
  const valueFields = ['content', 'note', 'value'];
  return scopeVariants.flatMap((scope) => positionVariants.flatMap((position) => valueFields.map((field) => ({ ...scope, ...position, [field]: value }))));
}
async function createCloudScheduleCell(type, day, period, value) {
  if (scheduleCellCreateTemplate && scheduleCellCreateTemplateType === type) {
    const body = normalizeSchedulePayload(Object.fromEntries(scheduleCellCreateTemplate.map(([key, source]) => [key, source === 'type' ? type : source === 'day' ? day : source === 'day-number' ? scheduleDayNumber(day) : source === 'period' ? period : source === 'period-number' ? schedulePeriodNumber(period) : source === 'value' ? value : source])));
    try {
      return await cloudRequest('schedule_cells', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
    } catch (error) {
      if (!isScheduleCellRetryable(error)) throw error;
      scheduleCellCreateTemplate = null;
      scheduleCellCreateTemplateType = null;
    }
  }
  let lastError;
  for (const body of scheduleCellVariants(type, day, period, value)) {
    try {
      const rows = await cloudRequest('schedule_cells', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(normalizeSchedulePayload(body)) });
      const typeKey = ['scope', 'schedule_type', 'type', 'kind'].find((key) => Object.prototype.hasOwnProperty.call(body, key));
      const dayKey = ['day_of_week', 'weekday', 'day'].find((key) => Object.prototype.hasOwnProperty.call(body, key));
      const periodKey = ['period', 'slot'].find((key) => Object.prototype.hasOwnProperty.call(body, key));
      const valueKey = ['content', 'note', 'value'].find((key) => Object.prototype.hasOwnProperty.call(body, key));
      scheduleCellCreateTemplate = Object.entries(body).map(([key, current]) => [key, key === typeKey ? 'type' : key === dayKey ? (current === scheduleDayNumber(day) ? 'day-number' : 'day') : key === periodKey ? (current === schedulePeriodNumber(period) ? 'period-number' : 'period') : key === valueKey ? 'value' : current]);
      scheduleCellCreateTemplateType = type;
      return rows;
    } catch (error) {
      lastError = error;
      if (!isScheduleCellRetryable(error)) throw error;
    }
  }
  throw lastError || new Error('常规课表单元格创建失败');
}
async function saveCloudScheduleCells(type = state.scheduleType) {
  requireCloudSession();
  const classRecord = cloudClass('2025级8班');
  if (!classRecord) throw new Error('未读取到 8 班云端信息，请重新登录后再试');
  const writes = [];
  const creates = [];
  const slots = type === 'class' ? periods : teacherPeriods;
  for (const day of weekdays) {
    for (const period of slots) {
      const key = scheduleCellKey(type, day, period);
      const value = String(state.schedule[key] ?? '').trim();
      const current = state.scheduleCells[key];
      if (!value) {
        if (current?.id) writes.push(cloudRequest(`schedule_cells?id=eq.${current.id}`, { method: 'DELETE' }));
        continue;
      }
      if (current?.id) {
        const field = scheduleCellValueField(current);
        writes.push(cloudRequest(`schedule_cells?id=eq.${current.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: value }) }));
      } else {
        creates.push({ type, day, period, value });
      }
    }
  }
  await Promise.all(writes);
  for (const entry of creates) await createCloudScheduleCell(entry.type, entry.day, entry.period, entry.value);
  await loadCloudScheduleCells();
  const missing = creates.filter((entry) => {
    const key = scheduleCellKey(entry.type, entry.day, entry.period);
    return !state.scheduleCells[key] || scheduleCellValue(state.scheduleCells[key]) !== entry.value;
  });
  if (missing.length) throw new Error(`云端回读未找到 ${missing.length} 项课表变更`);
  return writes.length + creates.length;
}
async function loadCloudWorkspaceData() {
  requireCloudSession();
  await Promise.all([loadCloudTodos(), loadCloudNotes(), loadCloudViolations(), loadCloudHomeworkFeedback(), loadCloudScheduleOverrides(), loadCloudScheduleCells(), loadCloudDictation(), loadCloudTests()]);
}
async function createCloudTodo(content, deadline) {
  requireCloudSession();
  const rows = await cloudRequest('todos', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ content, deadline, completed: false })
  });
  state.todos.unshift(asTodo(rows[0]));
}
async function updateCloudTodo(id, completed) {
  requireCloudSession();
  const rows = await cloudRequest(`todos?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ completed })
  });
  const index = state.todos.findIndex((item) => item.id === id);
  if (index >= 0 && rows[0]) state.todos[index] = asTodo(rows[0]);
}
async function createCloudNote(content) {
  requireCloudSession();
  const rows = await cloudRequest('quick_notes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ content })
  });
  state.notes.unshift(asNote(rows[0]));
}
async function createCloudViolation(eventDate, studentId, content) {
  requireCloudSession();
  const class8 = cloudClass('2025级8班');
  if (!class8 || !studentId) throw new Error('未读取到 8 班学生资料，请重新登录后再试');
  const rows = await cloudRequest('violations', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ class_id: class8.id, student_id: studentId, event_date: eventDate, content })
  });
  const student = roster8.find((item) => item.studentId === studentId);
  state.violations.unshift({ id: rows[0].id, date: rows[0].event_date, studentId, student: student?.name || '学生资料不可用', text: rows[0].content });
}
async function deleteCloudViolation(id) {
  requireCloudSession();
  await cloudRequest(`violations?id=eq.${id}`, { method: 'DELETE' });
  state.violations = state.violations.filter((item) => item.id !== id);
}
async function saveCloudHomeworkFeedback() {
  requireCloudSession();
  const classRecord = cloudClass(className(state.homeworkClass));
  const roster = rowsForClass(state.homeworkClass);
  if (!classRecord || !roster.length) throw new Error('未读取到当前班级学生资料，请重新登录后再试');
  if (!state.homeworkBatchId) {
    const batches = await cloudRequest('homework_batches', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ class_id: classRecord.id, homework_date: state.homeworkDate })
    });
    state.homeworkBatchId = batches[0]?.id;
  }
  if (!state.homeworkBatchId) throw new Error('作业批次创建失败');
  await Promise.all(roster.map(async (student) => {
    const current = state.feedback[student.studentId] || { rating: '优', note: '' };
    const record = { batch_id: state.homeworkBatchId, student_id: student.studentId, rating: current.rating || '优', note: current.note?.trim() || '' };
    if (current.id) {
      await cloudRequest(`homework_feedback?id=eq.${current.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ rating: record.rating, note: record.note }) });
    } else {
      const rows = await cloudRequest('homework_feedback', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
      state.feedback[student.studentId] = { ...current, id: rows[0]?.id, rating: record.rating, note: record.note || '' };
    }
  }));
}

function dictationTargetValue(studentId) {
  return state.dictationTargets[studentId]?.targetScore ?? '';
}
function dictationScoreValue(studentId, columnId) {
  const targetId = state.dictationTargets[studentId]?.id;
  const key = targetId ? dictationScoreKey(targetId, columnId) : dictationScoreKey(studentId, columnId);
  return state.dictationScores[key]?.score ?? '';
}
function validScore(value) {
  if (value === '' || value === null || value === undefined) return null;
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? score : NaN;
}
function dictationStatus(target, score) {
  const targetValue = validScore(target);
  const scoreValue = validScore(score);
  if (targetValue === null) return { label: '待设目标', className: 'blue' };
  if (scoreValue === null) return { label: '待录入', className: 'blue' };
  if (Number.isNaN(targetValue) || Number.isNaN(scoreValue)) return { label: '数据有误', className: 'bad' };
  return scoreValue >= targetValue ? { label: '达成', className: 'good' } : { label: '未达成', className: 'bad' };
}
async function createCloudDictationSheet(name) {
  requireCloudSession();
  const classRecord = cloudClass(className(state.classId));
  if (!classRecord) throw new Error('未读取到当前班级云端信息，请重新登录后再试');
  const rows = await createWithSchemaFallback('dictation_sheets', [
    { class_id: classRecord.id, stage_name: name },
    { class_id: classRecord.id, title: name },
    { class_id: classRecord.id, stage: name },
    { class_id: classRecord.id, name }
  ]);
  const sheet = rows[0];
  if (!sheet?.id) throw new Error('听写阶段表创建失败');
  await loadCloudDictation();
  state.dictationSelectedSheetId = sheet.id;
  await loadCloudDictationSheet();
}
async function createCloudDictationColumn(date, name) {
  requireCloudSession();
  if (!state.dictationSelectedSheetId) throw new Error('请先新建或选择一个听写阶段表');
  const sortOrder = state.dictationColumns.reduce((max, column) => Math.max(max, column.sortOrder), -1) + 1;
  const dateFields = ['dictation_date', 'column_date', 'date', 'recorded_date', 'session_date', 'record_date', 'listening_date'];
  const nameFields = ['dictation_name', 'column_name', 'name', 'title'];
  const variants = dateFields.flatMap((dateField) => nameFields.map((nameField) => ({
    sheet_id: state.dictationSelectedSheetId,
    [dateField]: date,
    [nameField]: name,
    sort_order: sortOrder
  })));
  const displayName = `${date} ${name}`;
  variants.push(...['label', 'title', 'dictation_name', 'column_name', 'name'].map((nameField) => ({
    sheet_id: state.dictationSelectedSheetId,
    [nameField]: displayName,
    sort_order: sortOrder
  })));
  await createWithSchemaFallback('dictation_columns', variants);
  await loadCloudDictationSheet();
}
async function saveCloudDictation() {
  requireCloudSession();
  const roster = rowsForClass(state.classId);
  if (!state.dictationSelectedSheetId || !roster.length) throw new Error('请先选择阶段表并读取学生资料');
  const pendingScores = Object.fromEntries(roster.flatMap((student) => state.dictationColumns.map((column) => [
    dictationScoreKey(student.studentId, column.id),
    dictationScoreValue(student.studentId, column.id)
  ])));
  const targetWrites = [];
  for (const student of roster) {
    const current = state.dictationTargets[student.studentId] || { studentId: student.studentId, targetScore: '' };
    const target = validScore(current.targetScore);
    if (Number.isNaN(target)) throw new Error(`${student.name} 的目标分需填写 0-100 的数字`);
    if (current.id) {
      if (target !== null) targetWrites.push(cloudRequest(`dictation_targets?id=eq.${current.id}`, { method: 'PATCH', body: JSON.stringify({ target_score: target }) }));
    } else if (target !== null) {
      targetWrites.push(cloudRequest('dictation_targets', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ sheet_id: state.dictationSelectedSheetId, student_id: student.studentId, target_score: target })
      }).then((rows) => {
        const id = rows[0]?.id;
        if (id) state.dictationTargets[student.studentId] = { ...current, id, targetScore: target };
      }));
    }
  }
  await Promise.all(targetWrites);
  const scoreWrites = [];
  for (const student of roster) {
    const targetId = state.dictationTargets[student.studentId]?.id;
    if (!targetId) continue;
    for (const column of state.dictationColumns) {
      const key = dictationScoreKey(targetId, column.id);
      const current = state.dictationScores[key];
      const score = validScore(pendingScores[dictationScoreKey(student.studentId, column.id)] ?? current?.score ?? '');
      if (Number.isNaN(score)) throw new Error(`${student.name} 的成绩需填写 0-100 的数字`);
      if (score === null) {
        if (current?.id) scoreWrites.push(cloudRequest(`dictation_scores?id=eq.${current.id}`, { method: 'DELETE' }));
      } else if (current?.id) {
        scoreWrites.push(cloudRequest(`dictation_scores?id=eq.${current.id}`, { method: 'PATCH', body: JSON.stringify({ score }) }));
      } else {
        scoreWrites.push(cloudRequest('dictation_scores', { method: 'POST', body: JSON.stringify({ target_id: targetId, column_id: column.id, score }) }));
      }
    }
  }
  await Promise.all(scoreWrites);
  await loadCloudDictationSheet();
}
async function saveCloudScheduleOverrides() {
  requireCloudSession();
  const class8 = cloudClass('2025级8班');
  if (!class8) throw new Error('未读取到 8 班云端信息，请重新登录后再试');
  const writes = Object.values(state.scheduleOverrides).map(async (entry) => {
    if (!entry.note?.trim()) {
      if (entry.id) await cloudRequest(`schedule_overrides?id=eq.${entry.id}`, { method: 'DELETE' });
      return;
    }
    const record = {
      scope: 'class',
      class_id: class8.id,
      class_name: class8.name,
      schedule_date: state.temporaryDate,
      slot: entry.slot,
      note: entry.note.trim()
    };
    if (entry.id) {
      await cloudRequest(`schedule_overrides?id=eq.${entry.id}`, { method: 'PATCH', body: JSON.stringify(record) });
    } else {
      await cloudRequest('schedule_overrides', { method: 'POST', body: JSON.stringify(record) });
    }
  });
  await Promise.all(writes);
  await loadCloudScheduleOverrides();
}

const navGroups = [
  { label: '工作台', items: [{ id: 'dashboard', icon: '⌂', label: '今日看板' }] },
  { label: '班级管理', items: [{ id: 'class-management', icon: '▤', label: '8班班级管理' }, { id: 'violations', icon: '!', label: '违纪记录' }] },
  { label: '教学记录', items: [{ id: 'homework', icon: '✓', label: '作业反馈' }, { id: 'dictation', icon: '↗', label: '听写成绩' }, { id: 'tests', icon: '▥', label: '单元测试' }] },
  { label: '课程与资料', items: [{ id: 'schedule', icon: '▦', label: '课程表' }, { id: 'planning', icon: '□', label: '课程规划' }, { id: 'prep', icon: '◌', label: '备课中心' }, { id: 'resources', icon: '↗', label: '资源库' }] },
  { label: '系统', items: [{ id: 'settings', icon: '⚙', label: '云端设置' }] }
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function formatDate(value) { return value ? value.replaceAll('-', '.') : ''; }
function studentDataMessage() {
  if (state.studentsStatus === 'signed-out') return '请先在云端设置中登录工作台账号。';
  if (state.studentsStatus === 'loading') return '正在从云端读取学生资料...';
  if (state.studentsStatus === 'error') return '云端学生资料读取失败，请检查网络连接或重新登录。';
  return '云端暂无学生资料，请在云端设置中导入两班学生资料。';
}
function profileFields(student) {
  return Object.entries(student.profile || {}).filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
}
function pageTitle() {
  return ({ dashboard: '今日看板', 'class-management': '8班班级管理', roster: '学生花名册', 'student-info': '学生信息', violations: '违纪记录', homework: '作业反馈', dictation: '听写成绩', tests: '单元测试', schedule: '课程表', planning: '课程规划', prep: '备课中心', resources: '资源库', settings: '云端设置' })[state.page] || '今日看板';
}
function className(id = state.classId) { return id === '8' ? '2025级8班' : '2025级7班'; }
function rowsForClass(id = state.classId) { return id === '8' ? roster8 : roster7; }
function blankSchedule(type) {
  const slots = type === 'class' ? periods : teacherPeriods;
  return Object.fromEntries(weekdays.flatMap((day) => slots.map((period) => [`${type}-${day}-${period}`, ''])));
}
function scheduleValue(type, day, period) {
  if (isTemporarySchedule(type)) {
    const date = type.slice('temporary-'.length);
    return state.scheduleOverrides[overrideKey(date, temporarySlot(day, period))]?.note || '';
  }
  return state.schedule[`${type}-${day}-${period}`] || '';
}
function setSchedule(type, day, period, value) {
  if (isTemporarySchedule(type)) {
    const date = type.slice('temporary-'.length);
    const slot = temporarySlot(day, period);
    const key = overrideKey(date, slot);
    state.scheduleOverrides[key] = { ...(state.scheduleOverrides[key] || {}), schedule_date: date, slot, note: value };
    state.scheduleOverridesDirty = true;
    return;
  }
  state.schedule[`${type}-${day}-${period}`] = value;
  save('teacher-schedule', state.schedule);
}

function renderShell() {
  app.innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">班</div><div class="brand-name">班主任工作台<span class="brand-sub">Teacher Workbench</span></div></div>
      ${navGroups.map((group) => `<div class="nav-label">${group.label}</div><nav class="nav">${group.items.map((item) => `<button class="${state.page === item.id ? 'active' : ''}" data-nav="${item.id}"><span class="nav-icon">${item.icon}</span>${item.label}</button>`).join('')}</nav>`).join('')}
      <div class="sidebar-foot">个人工作空间<br>${savedCloudConfig?.url ? '云端配置已保存' : '等待配置云端'}</div>
    </aside>
    <main class="main">
      <header class="topbar"><div><div class="page-kicker">2025 级 · 英语教学与班务</div><h1 class="page-title">${pageTitle()}</h1></div><div class="top-actions">${state.page === 'class-management' ? '<div class="date-chip">2025级8班</div>' : `<select class="class-switcher" id="class-switcher" aria-label="当前班级"><option value="8" ${state.classId === '8' ? 'selected' : ''}>2025级8班</option><option value="7" ${state.classId === '7' ? 'selected' : ''}>2025级7班</option></select>`}<div class="date-chip">● ${today.replaceAll('-', '.')}</div><div class="avatar">我</div></div></header>
      <section class="content" id="page-content"></section>
    </main>
  </div>
  <div id="modal-root"></div><div id="toast-root"></div>`;
  app.querySelectorAll('[data-nav]').forEach((button) => button.addEventListener('click', () => { state.page = button.dataset.nav; render(); }));
  document.querySelector('#class-switcher')?.addEventListener('change', (event) => {
    state.classId = event.target.value;
    state.dictationSelectedSheetId = null;
    state.testSelectedSheetId = null;
    if (state.session?.access_token) {
      Promise.all([loadCloudDictation(), loadCloudTests()]).then(render).catch((error) => { toast(error.message); render(); });
    } else {
      render();
    }
  });
  renderPage();
}

function render() { renderShell(); }
function panel(title, content, classes = '') { return `<section class="panel panel-pad ${classes}"><div class="panel-title"><h3>${title}</h3></div>${content}</section>`; }
function actionButton(label, action, primary = false) { return `<button class="button ${primary ? 'primary' : ''}" data-action="${action}">${label}</button>`; }

function renderRecoveryPage() {
  app.innerHTML = `<main class="recovery-page"><section class="recovery-card"><div class="recovery-mark">班</div><div><h1>设置新密码</h1><p>请为班主任工作台账号设置新密码。</p></div><form id="recovery-form" class="recovery-form"><div class="form-field"><label for="recovery-password">新密码</label><input class="input" id="recovery-password" type="password" autocomplete="new-password" minlength="8" required></div><div class="form-field"><label for="recovery-password-confirm">确认新密码</label><input class="input" id="recovery-password-confirm" type="password" autocomplete="new-password" minlength="8" required></div><button class="button primary" type="submit">更新密码</button><p class="recovery-message" id="recovery-message" aria-live="polite"></p></form></section></main>`;
  document.querySelector('#recovery-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = document.querySelector('#recovery-password').value;
    const confirmation = document.querySelector('#recovery-password-confirm').value;
    const message = document.querySelector('#recovery-message');
    if (password.length < 8) { message.textContent = '密码至少需要 8 个字符。'; return; }
    if (password !== confirmation) { message.textContent = '两次输入的密码不一致。'; return; }
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    message.textContent = '正在更新密码...';
    try {
      await updateRecoveryPassword(password);
      clearRecoveryUrl();
      app.innerHTML = `<main class="recovery-page"><section class="recovery-card"><div class="recovery-mark">班</div><div><h1>密码已更新</h1><p>请返回云端设置，使用工作台邮箱和新密码登录。</p></div><button class="button primary" id="return-to-settings">返回云端设置</button></section></main>`;
      document.querySelector('#return-to-settings').addEventListener('click', () => { state.page = 'settings'; render(); });
    } catch (error) {
      message.textContent = error.message;
      submit.disabled = false;
    }
  });
}

function dashboard() {
  const myCourses = [['早读', '2025级8班'], ['第一节', '2025级7班'], ['第三节', '2025级8班'], ['第五节', '2025级7班'], ['第七节', '2025级8班']];
  const classCourses = [['早读', '英语 · 课前准备'], ['第一节', '语文'], ['第二节', '数学'], ['第四节', '英语'], ['第六节', '地理']];
  const todoRows = state.todos.filter((item) => !item.done).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);
  return `<div class="content-head"><div><h2>周一，${today.replaceAll('-', '.')}</h2><p>两个班的今日安排集中在这里，记录完成后会自动留存。</p></div>${actionButton('+ 快捷记录', 'new-note', true)}</div>
    <div class="dashboard-grid">
      ${panel('今日我的课程', `<div class="schedule-list">${myCourses.map((item, i) => `<div class="schedule-item ${i === 0 ? 'current' : ''}"><span class="period">${item[0]}</span><div><div class="course-name">${item[1]}</div><div class="course-note">${i === 0 ? '当前安排' : '常规课表'}</div></div><span class="status-dot ${i === 0 ? 'current' : ''}"></span></div>`).join('')}</div>`, 'span-5')}
      ${panel('今日 8 班课程', `<div class="schedule-list">${classCourses.map((item, i) => `<div class="schedule-item ${i === 0 ? 'current' : ''}"><span class="period">${item[0]}</span><div><div class="course-name">${item[1]}</div><div class="course-note">${i === 0 ? '班级关注' : '班级常规安排'}</div></div><span class="status-dot ${i === 0 ? 'current' : ''}"></span></div>`).join('')}</div>`, 'span-4')}
      ${panel('临时调课', `<div class="notice">当天调课会覆盖当天显示，常规课表保持不变。<br><br>${actionButton('打开课程表', 'schedule', false)}</div>`, 'span-3')}
      ${panel('待办事项', `<div class="todo-list">${todoRows.length ? todoRows.map((item) => `<label class="todo-row"><input class="todo-toggle" data-id="${item.id}" type="checkbox"><span class="todo-text">${esc(item.text)}</span><span class="todo-date ${item.due < today ? 'overdue' : ''}">${item.due < today ? '已逾期 ' : ''}${formatDate(item.due)}</span></label>`).join('') : '<div class="empty">暂无未完成事项</div>'}</div><div style="margin-top:12px">${actionButton('管理待办', 'todo-list', false)}</div>`, 'span-7')}
      ${panel('快捷记录', `<div class="quick-actions"><button data-action="new-note"><strong>记录一条内容</strong><small>自动记录创建时间</small></button><button data-action="new-violation"><strong>记录 8 班事项</strong><small>日期 + 学生 + 内容</small></button><button data-action="new-homework"><strong>记录作业反馈</strong><small>默认全部为“优”</small></button><button data-action="schedule"><strong>调整今日课表</strong><small>按日期单独保存</small></button></div>`, 'span-5')}
      ${panel('记录概览', `<div class="metric-row"><div class="metric"><strong>${roster8.length}</strong><span>8班学生</span></div><div class="metric"><strong>${state.todos.filter((item) => !item.done).length}</strong><span>未完成待办</span></div><div class="metric"><strong>${state.notes.length}</strong><span>快捷记录</span></div></div>`, 'span-7')}
    </div>`;
}

function rosterPage(infoOnly = false) {
  const students = rowsForClass(infoOnly ? '8' : state.classId);
  if (!students.length) {
    const title = infoOnly ? '8班学生信息' : `${className()}学生花名册`;
    return `<div class="content-head"><div><h2>${title}</h2><p>只读查看云端学生资料。</p></div></div>${panel(infoOnly ? '学生信息' : '花名册', `<div class="empty">${studentDataMessage()}</div>`, 'span-12')}`;
  }
  const filtered = students.filter((student) => student.name.includes(state.studentsFilter) || (student.id || '').includes(state.studentsFilter) || (student.provincial || '').includes(state.studentsFilter) || (student.exam || '').includes(state.studentsFilter));
  const selected = students[state.selectedStudent] || students[0];
  const student = filtered.includes(selected) ? selected : filtered[0];
  if (!filtered.length) {
    const title = infoOnly ? '8班学生信息' : `${className()}学生花名册`;
    return `<div class="content-head"><div><h2>${title}</h2><p>只读查看云端学生资料。</p></div></div><div class="toolbar"><input class="input grow" id="student-search" placeholder="搜索姓名或身份证件号" value="${esc(state.studentsFilter)}"><span class="muted">0 人</span></div>${panel(infoOnly ? '学生信息' : '花名册', '<div class="empty">未找到符合条件的学生</div>', 'span-12')}`;
  }
  if (infoOnly) {
    const fields = profileFields(student);
    return `<div class="content-head"><div><h2>8班学生信息</h2><p>摘要列表 + 完整档案，数据仅从云端读取。</p></div></div><div class="toolbar"><input class="input grow" id="student-search" placeholder="搜索姓名或身份证件号" value="${esc(state.studentsFilter)}"><span class="muted">${filtered.length} 人</span></div><div class="profile-layout">${panel('学生列表', `<div class="student-list">${filtered.map((item) => `<div class="student-row ${item.name === student.name ? 'selected' : ''}" data-student="${students.indexOf(item)}"><span>${esc(item.name)}</span><small>${esc(item.gender)}</small></div>`).join('')}</div>`, '')}${panel('学生档案', `<div class="profile-section"><h4>${esc(student.name)}</h4><div class="field-grid">${fields.map(([label, value]) => `<div class="field"><label>${esc(label)}</label><div>${esc(value)}</div></div>`).join('') || '<div class="empty">该学生暂无可展示的档案字段</div>'}</div></div>`, '')}</div>`;
  }
  return `<div class="content-head"><div><h2>${className()}学生花名册</h2><p>只读查看，支持按姓名或编号搜索。</p></div></div><div class="toolbar"><input class="input grow" id="student-search" placeholder="搜索姓名、省学籍辅号或准考证号" value="${esc(state.studentsFilter)}"><span class="muted">${filtered.length} 人</span></div>${panel('花名册', filtered.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>身份证件号</th><th>省学籍辅号</th><th>准考证号</th></tr></thead><tbody>${filtered.map((item) => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.id)}</td><td>${esc(item.provincial)}</td><td>${esc(item.exam)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">请先在云端设置中导入学生资料</div>', 'span-12')}`;
}

function schedulePage() {
  const effectiveType = state.scheduleType === 'temporary' ? 'class' : state.scheduleType;
  const scheduleDataType = state.scheduleType === 'temporary' ? `temporary-${state.temporaryDate}` : effectiveType;
  const slots = effectiveType === 'class' ? periods : teacherPeriods;
  const selectedDay = state.scheduleType === 'temporary' ? weekdayForDate(state.temporaryDate) : null;
  const scheduleCell = (day, period) => {
    const editable = state.scheduleType !== 'temporary' || day === selectedDay;
    if (!editable) return '<td class="schedule-readonly">仅查看</td>';
    return `<td><textarea class="schedule-cell" data-schedule-type="${scheduleDataType}" data-day="${day}" data-period="${period}" placeholder="${effectiveType === 'teacher' ? '填写班级' : '填写课程'}">${esc(scheduleValue(scheduleDataType, day, period))}</textarea></td>`;
  };
  const dateToolbar = state.scheduleType === 'temporary'
    ? `<div class="toolbar"><label class="muted">调整日期</label><input class="input" id="temporary-date" type="date" value="${state.temporaryDate}"><span class="muted">${selectedDay ? `仅可编辑 ${selectedDay}，其他日期请切换调整日期` : '周末无需调课，请选择周一至周五'}</span></div>`
    : '';
  const saveLabel = state.scheduleSaveState === 'saving' ? '正在保存...' : '保存当前课表';
  const saveDisabled = state.scheduleSaveState === 'saving' ? ' disabled' : '';
  const syncMessage = state.scheduleSaveMessage ? `<span class="muted">${esc(state.scheduleSaveMessage)}</span>` : '';
  return `<div class="content-head"><div><h2>课程表</h2><p>周一至周五，点击格子直接填写；临时调课按具体日期保存，常规课表不会被覆盖。</p></div><div class="top-actions"><span id="schedule-sync-status">${syncMessage}</span><button class="button primary" data-action="save-schedule"${saveDisabled}>${saveLabel}</button></div></div><div class="tabbar"><button class="${state.scheduleType === 'class' ? 'active' : ''}" data-schedule="class">8班班级课表</button><button class="${state.scheduleType === 'teacher' ? 'active' : ''}" data-schedule="teacher">我的课表</button><button class="${state.scheduleType === 'temporary' ? 'active' : ''}" data-schedule="temporary">临时调课</button></div>${dateToolbar}${panel(effectiveType === 'class' ? (state.scheduleType === 'temporary' ? '临时调课' : '8班班级课表') : '我的课表', `<div class="schedule-editor"><table class="schedule-grid"><thead><tr><th>时段</th>${weekdays.map((day) => `<th>${day}</th>`).join('')}</tr></thead><tbody>${slots.map((period) => `<tr><td>${period}</td>${weekdays.map((day) => scheduleCell(day, period)).join('')}</tr>`).join('')}</tbody></table></div>`, 'span-12')}`;
}

function violationsPage() {
  const rows = state.violations.slice().sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="content-head"><div><h2>8班违纪记录</h2><p>不分类，只按日期记录具体事项，方便回看学生历史。</p></div>${actionButton('+ 新增记录', 'new-violation', true)}</div>${panel('记录列表', rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>日期</th><th>学生</th><th>具体内容</th><th></th></tr></thead><tbody>${rows.map((item) => `<tr><td>${formatDate(item.date)}</td><td>${esc(item.student)}</td><td>${esc(item.text)}</td><td><button class="button quiet small danger" data-delete-violation="${item.id}">删除</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">还没有违纪记录</div>', 'span-12')}`;
}

function homeworkPage() {
  const roster = rowsForClass(state.homeworkClass);
  const feedbackRows = roster.map((student) => {
    const status = state.feedback[student.studentId] || { rating: '优', note: '' };
    return `<tr><td><strong>${esc(student.name)}</strong></td><td><select class="input feedback-rating" data-student-id="${esc(student.studentId)}"><option ${status.rating === '优' ? 'selected' : ''}>优</option><option ${status.rating === '良' ? 'selected' : ''}>良</option><option ${status.rating === '差' ? 'selected' : ''}>差</option></select></td><td><input class="input feedback-note" data-student-id="${esc(student.studentId)}" value="${esc(status.note)}" placeholder="可选备注"></td></tr>`;
  }).join('');
  const content = roster.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>反馈</th><th>备注</th></tr></thead><tbody>${feedbackRows}</tbody></table></div>` : `<div class="empty">${state.studentsStatus === 'signed-out' ? '请先登录云端账号' : '请先完成学生资料导入'}</div>`;
  return `<div class="content-head"><div><h2>作业反馈</h2><p>按班级和日期建立反馈批次，新建批次默认全部为“优”。</p></div>${actionButton('保存本次反馈', 'save-homework', true)}</div><div class="toolbar"><select class="input" id="homework-class"><option value="8" ${state.homeworkClass === '8' ? 'selected' : ''}>2025级8班</option><option value="7" ${state.homeworkClass === '7' ? 'selected' : ''}>2025级7班</option></select><input class="input" type="date" id="homework-date" value="${state.homeworkDate}"><span class="muted">默认全部为“优”</span></div>${panel('学生反馈', content, 'span-12')}`;
}

function dictationPage() {
  const roster = rowsForClass(state.classId);
  if (!state.session?.access_token) {
    return `<div class="content-head"><div><h2>听写成绩</h2><p>按阶段建立成绩表，满分 100；每次听写增加“实际成绩 + 达成”两列。</p></div>${actionButton('+ 新建阶段表', 'new-dictation', true)}</div>${panel('听写成绩', '<div class="empty">请先在云端设置中登录工作台账号。</div>', 'span-12')}`;
  }
  if (!roster.length) {
    return `<div class="content-head"><div><h2>听写成绩</h2><p>按阶段建立成绩表，满分 100；每次听写增加“实际成绩 + 达成”两列。</p></div>${actionButton('+ 新建阶段表', 'new-dictation', true)}</div>${panel('听写成绩', `<div class="empty">${studentDataMessage()}</div>`, 'span-12')}`;
  }
  const selectedSheet = state.dictationSheets.find((sheet) => sheet.id === state.dictationSelectedSheetId);
  const title = selectedSheet?.name || '请选择或新建阶段表';
  const sheetOptions = state.dictationSheets.length
    ? state.dictationSheets.map((sheet) => `<option value="${esc(sheet.id)}" ${sheet.id === state.dictationSelectedSheetId ? 'selected' : ''}>${esc(sheet.name)}</option>`).join('')
    : '<option value="">暂无阶段表</option>';
  const columns = state.dictationColumns.slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const headerColumns = columns.map((column) => `<th>${esc(column.name)}<br><span class="muted">${esc(formatDate(column.date))}</span></th>`).join('');
  const rows = roster.map((student) => {
    const target = dictationTargetValue(student.studentId);
    const cells = columns.map((column) => {
      const score = dictationScoreValue(student.studentId, column.id);
      const status = dictationStatus(target, score);
      return `<td><input class="input dictation-score" data-student-id="${esc(student.studentId)}" data-column-id="${esc(column.id)}" style="width:90px" inputmode="decimal" min="0" max="100" value="${esc(score)}" placeholder="录入"><span class="badge ${status.className} dictation-status" data-student-id="${esc(student.studentId)}" data-column-id="${esc(column.id)}">${status.label}</span></td>`;
    }).join('');
    return `<tr><td><strong>${esc(student.name)}</strong></td><td><input class="input dictation-target" data-student-id="${esc(student.studentId)}" style="width:90px" inputmode="decimal" min="0" max="100" value="${esc(target)}"></td>${cells}</tr>`;
  }).join('');
  const table = state.dictationSelectedSheetId
    ? `<div class="table-wrap"><table class="data-table dictation-table"><thead><tr><th>姓名</th><th>目标成绩</th>${headerColumns}</tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">请先新建一个听写阶段表。</div>';
  return `<div class="content-head"><div><h2>听写成绩</h2><p>按阶段建立成绩表，满分 100；每次听写增加“实际成绩 + 达成”两列。</p></div><div class="top-actions">${actionButton('+ 新建阶段表', 'new-dictation', true)}${actionButton('+ 添加听写列', 'new-dictation-column')}${actionButton('保存听写成绩', 'save-dictation')}</div></div><div class="toolbar"><select class="input" id="dictation-sheet">${sheetOptions}</select><button class="button" data-action="ocr-import">拍照识别成绩单</button><span class="muted">${state.dictationSheets.length ? '识别后先核对，再手动确认写入' : '先建立阶段表，再添加听写日期'}</span></div>${panel(title, table, 'span-12')}`;
}

function testsPage() {
  const roster = rowsForClass(state.classId);
  if (!state.session?.access_token) return `<div class="content-head"><div><h2>单元测试</h2><p>每次测试独立建表，手动录入并自动计算班级排名和进退步名次。</p></div>${actionButton('+ 新建测试表', 'new-test', true)}</div>${panel('单元测试', '<div class="empty">请先在云端设置中登录工作台账号。</div>', 'span-12')}`;
  if (!roster.length) return `<div class="content-head"><div><h2>单元测试</h2><p>每次测试独立建表，手动录入并自动计算班级排名和进退步名次。</p></div>${actionButton('+ 新建测试表', 'new-test', true)}</div>${panel('单元测试', `<div class="empty">${studentDataMessage()}</div>`, 'span-12')}`;
  const selectedSheet = state.testSheets.find((sheet) => sheet.id === state.testSelectedSheetId);
  const sheetOptions = state.testSheets.length
    ? state.testSheets.map((sheet) => `<option value="${esc(sheet.id)}" ${sheet.id === state.testSelectedSheetId ? 'selected' : ''}>${esc(sheet.name)}${sheet.date ? ` · ${esc(formatDate(sheet.date))}` : ''}</option>`).join('')
    : '<option value="">暂无测试表</option>';
  const rows = testRankRows().map((item) => {
    const progress = validRank(item.reference) !== null && item.rank ? Number(item.reference) - Number(item.rank) : null;
    const progressLabel = progress === null ? '—' : progress > 0 ? `进步 ${progress}` : progress < 0 ? `退步 ${Math.abs(progress)}` : '持平';
    const progressClass = progress === null || progress === 0 ? 'blue' : progress > 0 ? 'good' : 'bad';
    return `<tr><td><strong>${esc(item.student.name)}</strong></td><td><input class="input test-score" data-student-id="${esc(item.student.studentId)}" style="width:90px" inputmode="decimal" min="0" max="100" value="${esc(item.score)}" placeholder="录入"></td><td><span class="test-current-rank" data-student-id="${esc(item.student.studentId)}">${item.rank || '—'}</span></td><td><input class="input test-reference-rank" data-student-id="${esc(item.student.studentId)}" style="width:90px" inputmode="numeric" min="1" value="${esc(item.reference)}" placeholder="可选"></td><td><span class="badge ${progressClass} test-progress" data-student-id="${esc(item.student.studentId)}">${progressLabel}</span></td></tr>`;
  }).join('');
  const table = state.testSelectedSheetId
    ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>姓名</th><th>成绩</th><th>当前排名</th><th>对照排名</th><th>进退步</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<div class="empty">请先新建一个单元测试表。</div>';
  return `<div class="content-head"><div><h2>单元测试</h2><p>每次测试独立建表，手动录入并自动计算班级排名和进退步名次。</p></div><div class="top-actions">${actionButton('+ 新建测试表', 'new-test', true)}${actionButton('保存测试成绩', 'save-tests')}</div></div><div class="toolbar"><select class="input" id="test-sheet">${sheetOptions}</select><label class="button" for="test-reference-file">导入姓名 + 排名</label><input id="test-reference-file" type="file" accept=".csv,.tsv,.txt" hidden><span class="muted">${selectedSheet?.date ? `测试日期：${formatDate(selectedSheet.date)}` : '可选导入历史排名对照表'}</span></div>${panel(selectedSheet?.name || '测试成绩', table, 'span-12')}`;
}

function updateTestRankDisplay() {
  const rows = testRankRows();
  rows.forEach((item) => {
    const rank = document.querySelector(`.test-current-rank[data-student-id="${item.student.studentId}"]`);
    const reference = document.querySelector(`.test-reference-rank[data-student-id="${item.student.studentId}"]`);
    const progressElement = document.querySelector(`.test-progress[data-student-id="${item.student.studentId}"]`);
    if (rank) rank.textContent = item.rank || '—';
    if (!progressElement) return;
    const progress = validRank(item.reference) !== null && item.rank ? Number(item.reference) - Number(item.rank) : null;
    progressElement.textContent = progress === null ? '—' : progress > 0 ? `进步 ${progress}` : progress < 0 ? `退步 ${Math.abs(progress)}` : '持平';
    progressElement.className = `badge ${progress === null || progress === 0 ? 'blue' : progress > 0 ? 'good' : 'bad'} test-progress`;
    if (reference && reference.value !== String(item.reference ?? '')) reference.value = item.reference ?? '';
  });
}
function applyTestReferenceText(text) {
  const roster = rowsForClass(state.classId);
  const byName = new Map(roster.map((student) => [student.name.trim(), student]));
  let matched = 0;
  let ignored = 0;
  text.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
    const parts = line.includes('\t') ? line.split('\t') : line.split(/[,，]/);
    if (parts.length < 2) { ignored += 1; return; }
    const name = parts[0].trim();
    const rank = validRank(parts[1].trim());
    const student = byName.get(name);
    if (!student || rank === null || Number.isNaN(rank)) { ignored += 1; return; }
    state.testRankReferences[student.studentId] = { ...(state.testRankReferences[student.studentId] || {}), studentId: student.studentId, rank };
    matched += 1;
  });
  renderPage();
  toast(`已读取 ${matched} 条排名${ignored ? `，忽略 ${ignored} 条` : ''}`);
}

function planningPage() {
  return `<div class="content-head"><div><h2>课程规划</h2><p>按单元组织课时内容，只保留内容与完成勾选。</p></div>${actionButton('+ 新增单元', 'new-unit', true)}</div>${panel('课程规划', `<div class="empty">还没有规划内容，点击“新增单元”开始。</div>`, 'span-12')}`;
}

function prepPage() {
  return `<div class="content-head"><div><h2>备课中心</h2><p>工作流接口已预留，后续按你的真实备课方式接入。</p></div></div>${panel('备课工作流接口', '<div class="notice">这里暂时保留为空白工作区，不预设固定步骤。后续可以接入教案、课件、资源和课后反思。</div>', 'span-12')}`;
}

function resourcesPage() {
  return `<div class="content-head"><div><h2>资源库</h2><p>名称 + 网址，点击即可打开常用网站。</p></div>${actionButton('+ 添加网址', 'new-resource', true)}</div>${panel('常用网站', `<div class="resource-list">${state.resources.map((item, i) => `<div class="resource-row"><strong>${esc(item.name)}</strong><a href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.url)}</a><button class="button quiet small danger" data-delete-resource="${i}">删除</button></div>`).join('')}</div>`, 'span-12')}`;
}

function settingsPage() {
  const config = cloudConfig();
  const signedIn = Boolean(state.session?.access_token);
  const connection = panel('Supabase 连接', `<div class="form-grid"><div class="form-field full"><label for="cloud-url">Project URL</label><input class="input" id="cloud-url" value="${esc(config?.url || '')}" placeholder="https://你的项目.supabase.co"></div><div class="form-field full"><label for="cloud-key">Publishable / anon key</label><input class="input" id="cloud-key" type="password" value="${esc(config?.publishableKey || '')}" placeholder="粘贴 Supabase API 页面中的 Publishable 或 anon key"></div></div><div class="modal-actions" style="justify-content:flex-start"><button class="button primary" data-action="save-cloud-config">保存连接配置</button></div>`, 'span-12');
  const account = signedIn
    ? panel('工作台账号', `<div class="notice">已登录云端账号。</div><div class="modal-actions" style="justify-content:flex-start"><button class="button" data-action="cloud-logout">退出云端账号</button></div>`, 'span-12')
    : panel('工作台账号', `<div class="form-grid"><div class="form-field"><label for="cloud-email">邮箱</label><input class="input" id="cloud-email" type="email" autocomplete="username"></div><div class="form-field"><label for="cloud-password">密码</label><input class="input" id="cloud-password" type="password" autocomplete="current-password"></div></div><div class="modal-actions" style="justify-content:flex-start"><button class="button primary" data-action="cloud-login">登录云端账号</button></div>`, 'span-12');
  const importPanel = signedIn ? panel('学生资料导入', `<div class="notice">需要时才读取本机私有导入数据；导入会写入你的 Supabase 私有数据库。</div><div class="modal-actions" style="justify-content:flex-start"><button class="button primary" data-action="cloud-import-students">导入两班学生资料</button></div>`, 'span-12') : '';
  return `<div class="content-head"><div><h2>云端设置</h2><p>连接当前 Supabase 项目后，工作记录可在设备间同步。</p></div></div>${connection}${account}${importPanel}`;
}

function renderPage() {
  const content = document.querySelector('#page-content');
  if (state.page === 'class-management') {
    content.innerHTML = '<div id="class-management-root"></div>';
    window.ClassManagement?.mount(document.querySelector('#class-management-root'));
  } else {
    content.innerHTML = state.page === 'dashboard' ? dashboard() : state.page === 'roster' ? rosterPage() : state.page === 'student-info' ? rosterPage(true) : state.page === 'schedule' ? schedulePage() : state.page === 'violations' ? violationsPage() : state.page === 'homework' ? homeworkPage() : state.page === 'dictation' ? dictationPage() : state.page === 'tests' ? testsPage() : state.page === 'planning' ? planningPage() : state.page === 'prep' ? prepPage() : state.page === 'resources' ? resourcesPage() : settingsPage();
  }
  bindPageEvents();
}

function refreshTemporarySchedule() {
  renderPage();
  loadCloudScheduleOverrides().then(renderPage).catch((error) => { toast(error.message); renderPage(); });
}

function bindPageEvents() {
  document.querySelectorAll('[data-action]').forEach((element) => element.addEventListener('click', () => handleAction(element.dataset.action)));
  document.querySelectorAll('[data-schedule]').forEach((element) => element.addEventListener('click', () => {
    state.scheduleType = element.dataset.schedule;
    state.scheduleSaveState = 'idle';
    state.scheduleSaveMessage = '';
    if (state.scheduleType === 'temporary') refreshTemporarySchedule();
    else renderPage();
  }));
  document.querySelectorAll('.todo-toggle').forEach((element) => element.addEventListener('change', () => {
    const item = state.todos.find((todo) => todo.id === element.dataset.id);
    if (!item) return;
    const completed = element.checked;
    updateCloudTodo(item.id, completed).then(renderPage).catch((error) => {
      element.checked = !completed;
      toast(error.message);
    });
  }));
  document.querySelectorAll('[data-delete-violation]').forEach((element) => element.addEventListener('click', () => {
    deleteCloudViolation(element.dataset.deleteViolation).then(() => { renderPage(); toast('违纪记录已删除'); }).catch((error) => toast(error.message));
  }));
  document.querySelectorAll('[data-delete-resource]').forEach((element) => element.addEventListener('click', () => { state.resources.splice(Number(element.dataset.deleteResource), 1); save('teacher-resources', state.resources); renderPage(); }));
  const search = document.querySelector('#student-search');
  if (search) search.addEventListener('input', (event) => { state.studentsFilter = event.target.value; const current = state.page === 'student-info'; document.querySelector('#page-content').innerHTML = current ? rosterPage(true) : rosterPage(); bindPageEvents(); });
  document.querySelectorAll('[data-student]').forEach((element) => element.addEventListener('click', () => { state.selectedStudent = Number(element.dataset.student); renderPage(); }));
  document.querySelectorAll('.schedule-cell').forEach((element) => element.addEventListener('input', () => setSchedule(element.dataset.scheduleType, element.dataset.day, element.dataset.period, element.value)));
  const temporaryDate = document.querySelector('#temporary-date');
  if (temporaryDate) temporaryDate.addEventListener('change', (event) => {
    if (state.scheduleOverridesDirty) {
      event.target.value = state.temporaryDate;
      toast('请先保存当前日期的临时调课');
      return;
    }
    state.temporaryDate = event.target.value;
    refreshTemporarySchedule();
  });
  const homeworkClass = document.querySelector('#homework-class');
  if (homeworkClass) homeworkClass.addEventListener('change', (event) => { state.homeworkClass = event.target.value; state.homeworkBatchId = null; state.feedback = {}; renderPage(); loadCloudHomeworkFeedback().then(renderPage).catch((error) => toast(error.message)); });
  const homeworkDate = document.querySelector('#homework-date');
  if (homeworkDate) homeworkDate.addEventListener('change', (event) => { state.homeworkDate = event.target.value; state.homeworkBatchId = null; state.feedback = {}; renderPage(); loadCloudHomeworkFeedback().then(renderPage).catch((error) => toast(error.message)); });
  document.querySelectorAll('.feedback-rating, .feedback-note').forEach((element) => element.addEventListener('change', () => { const key = element.dataset.studentId; state.feedback[key] = state.feedback[key] || { rating: '优', note: '' }; if (element.classList.contains('feedback-rating')) state.feedback[key].rating = element.value; else state.feedback[key].note = element.value; }));
  const dictationSheet = document.querySelector('#dictation-sheet');
  if (dictationSheet) dictationSheet.addEventListener('change', (event) => {
    state.dictationSelectedSheetId = event.target.value || null;
    loadCloudDictationSheet().then(renderPage).catch((error) => toast(error.message));
  });
  document.querySelectorAll('.dictation-target').forEach((element) => element.addEventListener('input', () => {
    const studentId = element.dataset.studentId;
    state.dictationTargets[studentId] = { ...(state.dictationTargets[studentId] || { studentId }), studentId, targetScore: element.value };
    updateDictationStatuses(studentId);
  }));
  document.querySelectorAll('.dictation-score').forEach((element) => element.addEventListener('input', () => {
    const studentId = element.dataset.studentId;
    const columnId = element.dataset.columnId;
    const targetId = state.dictationTargets[studentId]?.id;
    const key = dictationScoreKey(targetId || studentId, columnId);
    state.dictationScores[key] = { ...(state.dictationScores[key] || {}), targetId, columnId, score: element.value };
    updateDictationStatuses(studentId);
  }));
  const testSheet = document.querySelector('#test-sheet');
  if (testSheet) testSheet.addEventListener('change', (event) => {
    state.testSelectedSheetId = event.target.value || null;
    loadCloudTestSheet().then(renderPage).catch((error) => toast(error.message));
  });
  document.querySelectorAll('.test-score').forEach((element) => element.addEventListener('input', () => {
    const studentId = element.dataset.studentId;
    state.testScores[studentId] = { ...(state.testScores[studentId] || { studentId }), studentId, score: element.value };
    updateTestRankDisplay();
  }));
  document.querySelectorAll('.test-reference-rank').forEach((element) => element.addEventListener('input', () => {
    const studentId = element.dataset.studentId;
    state.testRankReferences[studentId] = { ...(state.testRankReferences[studentId] || { studentId }), studentId, rank: element.value };
    updateTestRankDisplay();
  }));
  const testReferenceFile = document.querySelector('#test-reference-file');
  if (testReferenceFile) testReferenceFile.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      applyTestReferenceText(await file.text());
    } catch (error) {
      toast(`对照表读取失败：${error.message}`);
    } finally {
      event.target.value = '';
    }
  });
}

function updateDictationStatuses(studentId) {
  const target = dictationTargetValue(studentId);
  document.querySelectorAll('.dictation-status').forEach((element) => {
    if (element.dataset.studentId !== studentId) return;
    const score = dictationScoreValue(studentId, element.dataset.columnId);
    const status = dictationStatus(target, score);
    element.textContent = status.label;
    element.className = `badge ${status.className} dictation-status`;
  });
}

function handleAction(action) {
  if (action === 'schedule') { state.page = 'schedule'; render(); return; }
  if (action === 'todo-list') { openTodoModal(); return; }
  if (action === 'new-note') { openNoteModal(); return; }
  if (action === 'new-violation') { openViolationModal(); return; }
  if (action === 'new-homework') { state.page = 'homework'; render(); return; }
  if (action === 'save-schedule') {
    if (state.scheduleType !== 'temporary') {
      const type = state.scheduleType;
      const label = type === 'teacher' ? '我的课表' : '8班班级课表';
      state.scheduleSaveState = 'saving';
      state.scheduleSaveMessage = `正在同步${label}...`;
      renderPage();
      saveCloudScheduleCells(type).then((count) => {
        state.scheduleSaveState = 'saved';
        state.scheduleSaveMessage = `${label}已同步到云端（${count} 项变更）`;
        renderPage();
        toast(`${label}已同步到云端`);
      }).catch((error) => {
        state.scheduleSaveState = 'error';
        state.scheduleSaveMessage = `${label}保存失败：${error.message}`;
        renderPage();
        toast(error.message);
      });
      return;
    }
    if (!weekdayForDate(state.temporaryDate)) { toast('临时调课仅适用于周一至周五'); return; }
    state.scheduleSaveState = 'saving';
    state.scheduleSaveMessage = '正在同步临时调课...';
    renderPage();
    saveCloudScheduleOverrides().then(() => {
      state.scheduleSaveState = 'saved';
      state.scheduleSaveMessage = '临时调课已同步到云端';
      renderPage();
      toast('临时调课已同步到云端');
    }).catch((error) => {
      state.scheduleSaveState = 'error';
      state.scheduleSaveMessage = `临时调课保存失败：${error.message}`;
      renderPage();
      toast(error.message);
    });
    return;
  }
  if (action === 'save-homework') { saveCloudHomeworkFeedback().then(() => { renderPage(); toast('作业反馈已同步到云端'); }).catch((error) => toast(error.message)); return; }
  if (action === 'ocr-import') { toast('拍照识别接口已预留，接入 OCR 后可上传成绩单'); return; }
  if (action === 'new-dictation') { openStageModal(); return; }
  if (action === 'new-dictation-column') { openDictationColumnModal(); return; }
  if (action === 'save-dictation') { saveCloudDictation().then(() => { renderPage(); toast('听写成绩已同步到云端'); }).catch((error) => toast(error.message)); return; }
  if (action === 'save-tests') { saveCloudTests().then(() => { renderPage(); toast('单元测试成绩已同步到云端'); }).catch((error) => toast(error.message)); return; }
  if (action === 'new-test') { openTestModal(); return; }
  if (action === 'new-unit') { openUnitModal(); return; }
  if (action === 'new-resource') { openResourceModal(); return; }
  if (action === 'save-cloud-config') {
    const url = document.querySelector('#cloud-url')?.value.trim().replace(/\/$/, '');
    const publishableKey = document.querySelector('#cloud-key')?.value.trim();
    if (!url || !publishableKey) { toast('请填写 Project URL 和 Publishable key'); return; }
    localStorage.setItem('teacher-cloud-config', JSON.stringify({ url, publishableKey }));
    window.location.reload();
    return;
  }
  if (action === 'cloud-login') {
    const email = document.querySelector('#cloud-email')?.value.trim();
    const password = document.querySelector('#cloud-password')?.value;
    if (!email || !password) { toast('请填写邮箱和密码'); return; }
    cloudLogin(email, password).then(() => { render(); toast('云端账号已登录'); }).catch((error) => toast(error.message));
    return;
  }
  if (action === 'cloud-logout') {
    state.session = null;
    localStorage.removeItem('teacher-cloud-session');
    roster8 = [];
    roster7 = [];
    state.studentsStatus = 'signed-out';
    state.cloudClasses = [];
    state.todos = [];
    state.notes = [];
    state.violations = [];
    state.homeworkBatchId = null;
    state.feedback = {};
    state.dictationSheets = [];
    state.dictationSelectedSheetId = null;
    state.dictationColumns = [];
    state.dictationTargets = {};
    state.dictationScores = {};
    state.testSheets = [];
    state.testSelectedSheetId = null;
    state.testScores = {};
    state.testRankReferences = {};
    state.scheduleOverrides = {};
    state.scheduleOverridesDirty = false;
    render();
    return;
  }
  if (action === 'cloud-import-students') {
    uploadSeedStudents().then(() => { render(); toast('两班学生资料已导入云端'); }).catch((error) => toast(error.message));
    return;
  }
}

function modal(title, body, onSubmit) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal"><h3>${title}</h3>${body}<div class="modal-actions"><button class="button quiet" data-close-modal>取消</button><button class="button primary" data-submit-modal>保存</button></div></div></div>`;
  root.querySelector('[data-close-modal]').addEventListener('click', () => { root.innerHTML = ''; });
  root.querySelector('[data-submit-modal]').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try {
      const successMessage = await onSubmit(root);
      root.innerHTML = '';
      render();
      if (successMessage) toast(successMessage);
    } catch (error) {
      toast(error.message);
      event.currentTarget.disabled = false;
    }
  });
}
function openNoteModal() { modal('记录一条内容', '<div class="form-field full"><label>内容</label><textarea class="input" id="note-text" placeholder="写下需要留存的内容"></textarea></div>', async (root) => { const text = root.querySelector('#note-text').value.trim(); if (!text) throw new Error('请填写内容'); await createCloudNote(text); return '快捷记录已同步到云端'; }); }
function openViolationModal() {
  if (!roster8.length) { toast('请先登录并读取 8 班学生资料'); return; }
  modal('新增违纪记录', `<div class="form-grid"><div class="form-field"><label>日期</label><input class="input" id="violation-date" type="date" value="${today}"></div><div class="form-field"><label>学生</label><select class="input" id="violation-student">${roster8.map((student) => `<option value="${esc(student.studentId)}">${esc(student.name)}</option>`).join('')}</select></div><div class="form-field full"><label>具体内容</label><textarea class="input" id="violation-text" placeholder="填写事实记录"></textarea></div></div>`, async (root) => {
    const text = root.querySelector('#violation-text').value.trim();
    const eventDate = root.querySelector('#violation-date').value;
    const studentId = root.querySelector('#violation-student').value;
    if (!eventDate || !studentId || !text) throw new Error('请填写日期、学生和具体内容');
    await createCloudViolation(eventDate, studentId, text);
    return '违纪记录已同步到云端';
  });
}
function openTodoModal() { modal('新增待办', `<div class="form-grid"><div class="form-field full"><label>事项内容</label><input class="input" id="todo-text" placeholder="填写需要完成的事项"></div><div class="form-field"><label>截止日期</label><input class="input" id="todo-due" type="date" value="${today}"></div></div>`, async (root) => { const text = root.querySelector('#todo-text').value.trim(); const deadline = root.querySelector('#todo-due').value; if (!text || !deadline) throw new Error('请填写事项和截止日期'); await createCloudTodo(text, deadline); return '待办已同步到云端'; }); }
function openStageModal() {
  modal('新建听写阶段表', '<div class="form-field"><label>阶段名称</label><input class="input" id="stage-name" value="Unit 1 听写"></div>', async (root) => {
    const name = root.querySelector('#stage-name').value.trim();
    if (!name) throw new Error('请填写阶段名称');
    await createCloudDictationSheet(name);
    return '听写阶段表已同步到云端';
  });
}
function openDictationColumnModal() {
  modal('添加听写项目', `<div class="form-grid"><div class="form-field"><label>听写日期</label><input class="input" id="dictation-column-date" type="date" value="${today}"></div><div class="form-field"><label>项目名称</label><input class="input" id="dictation-column-name" value="单词听写"></div></div>`, async (root) => {
    const date = root.querySelector('#dictation-column-date').value;
    const name = root.querySelector('#dictation-column-name').value.trim();
    if (!date || !name) throw new Error('请填写日期和项目名称');
    await createCloudDictationColumn(date, name);
    return '听写项目已同步到云端';
  });
}
function openTestModal() {
  modal('新建单元测试表', `<div class="form-grid"><div class="form-field"><label>测试名称</label><input class="input" id="test-name" placeholder="例如 Unit 1 测试"></div><div class="form-field"><label>日期</label><input class="input" id="test-date" type="date" value="${today}"></div></div>`, async (root) => {
    const name = root.querySelector('#test-name').value.trim();
    const date = root.querySelector('#test-date').value;
    if (!name || !date) throw new Error('请填写测试名称和日期');
    await createCloudTestSheet(name, date);
    return '单元测试表已同步到云端';
  });
}
function openUnitModal() { modal('新增课程单元', '<div class="form-field"><label>单元名称</label><input class="input" id="unit-name" placeholder="例如 Unit 1"></div>', () => toast('单元已建立')); }
function openResourceModal() { modal('添加常用网站', '<div class="form-grid"><div class="form-field"><label>名称</label><input class="input" id="resource-name" placeholder="网站名称"></div><div class="form-field"><label>网址</label><input class="input" id="resource-url" placeholder="https://"></div></div>', (root) => { const name = root.querySelector('#resource-name').value.trim(); const url = root.querySelector('#resource-url').value.trim(); if (name && url) { state.resources.push({ name, url }); save('teacher-resources', state.resources); toast('网址已添加'); } }); }
function toast(message) { const root = document.querySelector('#toast-root'); if (!root) return; root.innerHTML = `<div class="toast">${esc(message)}</div>`; setTimeout(() => { root.innerHTML = ''; }, 2300); }

async function boot() {
  if (recoveryAccessToken()) {
    renderRecoveryPage();
    return;
  }
  if (state.session?.access_token && cloudConfig()) {
    try {
      await loadCloudStudents();
      await loadCloudWorkspaceData();
    } catch (error) { console.warn('云端数据暂时不可用', error); }
  }
  renderShell();
}

boot();
