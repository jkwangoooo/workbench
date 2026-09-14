(function () {
  'use strict';

  const root = document.querySelector('#local-app');
  const today = new Date().toISOString().slice(0, 10);
  const LOCAL_KEYS = {
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
    seatingLayout: 'teacher-local-seating-layout'
  };
  const weekdays = ['周一', '周二', '周三', '周四', '周五'];
  const class8Name = '2025级8班';
  const class7Name = '2025级7班';
  const slots = ['早读', '第1节', '第2节', '第3节', '第4节', '午休', '第5节', '第6节', '第7节', '第8节', '课辅A', '课辅B', '课辅C'];
  const seed = window.WORKBENCH_SEED || { classes: [] };

  const state = {
    page: 'dashboard',
    scheduleType: 'class',
    temporaryDate: today,
    selectedStudent: null,
    rosterClass: '8',
    profileClass: '8',
    homeworkClass: '8',
    homeworkDate: today,
    dictationClass: '8',
    selectedDictation: null,
    testClass: '8',
    selectedTest: null,
    planClass: '8',
    resourceTab: 'links',
    groupLayout: read(LOCAL_KEYS.groupLayout, null),
    seatingLayout: read(LOCAL_KEYS.seatingLayout, null),
    pendingImport: null,
    modal: null
  };

  const classByNumber = (number) => seed.classes.find((item) => item.name.includes(number + '班')) || { name: number === '8' ? class8Name : class7Name, students: [] };
  const roster8 = normalizeStudents(classByNumber('8'), true);
  const roster7 = normalizeStudents(classByNumber('7'), false);
  const rosterFor = (number) => number === '7' ? roster7 : roster8;
  const studentMap = new Map(roster8.concat(roster7).map((student) => [student.name, student]));

  function normalizeStudents(classRecord, fullProfile) {
    return (classRecord.students || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)).map((student, index) => ({
      id: `local-${fullProfile ? '8' : '7'}-${index + 1}`,
      name: String(student.name || '').trim(),
      sortOrder: student.sortOrder ?? index,
      identityNumber: student.identityNumber || '',
      provincialStudentNumber: student.provincialStudentNumber || '',
      examNumber: student.examNumber || '',
      profile: student.profile || {}
    }));
  }

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (_) { return fallback; }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function uid(prefix) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function attr(value) { return esc(value); }
  function fmtDate(value) { return value ? String(value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日') : ''; }
  function classLabel(number) { return number === '7' ? class7Name : class8Name; }
  function currentWeekday(date) { const day = new Date(`${date}T12:00:00`).getDay(); return day === 0 ? null : day === 6 ? null : weekdays[day - 1]; }
  function toast(message) { const old = document.querySelector('.local-toast'); if (old) old.remove(); const node = document.createElement('div'); node.className = 'local-toast'; node.textContent = message; document.body.appendChild(node); setTimeout(() => node.remove(), 2600); }
  function panel(title, body, extra) { return `<section class="local-panel pad ${extra || ''}"><div class="local-panel-title"><h3>${esc(title)}</h3></div>${body}</section>`; }
  function empty(text) { return `<div class="local-empty">${esc(text)}</div>`; }
  function button(label, action, extra) { return `<button type="button" class="local-button ${extra || ''}" data-action="${attr(action)}">${esc(label)}</button>`; }
  function inputField(label, name, value, type = 'text', extra = '') { return `<div class="local-field"><label>${esc(label)}</label><input class="local-input" name="${attr(name)}" type="${type}" value="${attr(value)}" ${extra}></div>`; }
  function selectField(label, name, options, selected) { return `<div class="local-field"><label>${esc(label)}</label><select class="local-select" name="${attr(name)}">${options.map(([value, label]) => `<option value="${attr(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></div>`; }

  function nav() {
    const sections = [
      ['工作台', [['dashboard', '今日看板']]],
      ['班级业务', [['class-management', '8班班级管理'], ['roster', '姓名目录'], ['violations', '违纪记录'], ['homework', '作业反馈']]],
      ['成绩记录', [['dictation', '听写成绩'], ['tests', '单元测试']]],
      ['课程与资料', [['schedule', '课程表'], ['planning', '课程规划'], ['prep', '备课中心'], ['resources', '资源库']]]
    ];
    return sections.map(([heading, items]) => `<div class="local-nav-label">${esc(heading)}</div><nav class="local-nav">${items.map(([id, label]) => `<button type="button" class="${state.page === id ? 'active' : ''}" data-page="${id}">${esc(label)}</button>`).join('')}</nav>`).join('');
  }
  function shell(content) {
    const title = { dashboard: '今日看板', 'class-management': '8班班级管理', roster: '姓名目录', violations: '违纪记录', homework: '作业反馈', dictation: '听写成绩', tests: '单元测试', schedule: '课程表', planning: '课程规划', prep: '备课中心', resources: '资源库' }[state.page] || '今日看板';
    return `<div class="local-shell"><aside class="local-sidebar"><div class="local-brand"><span class="local-mark">教</span><div><strong>班主任工作台</strong><small>本地业务版</small></div></div>${nav()}<div class="local-sidebar-foot">本地数据保存在当前浏览器<br>不连接云端，不上传资料</div></aside><main class="local-main"><header class="local-topbar"><div><div class="local-kicker">2025级 · 教学与班务</div><h1 class="local-title">${esc(title)}</h1></div><div class="local-actions"><span class="local-date">${fmtDate(today)}</span>${button('本地数据说明', 'data-info', 'small')}</div></header><div class="local-content">${content}</div></main></div>${state.modal ? modalHtml() : ''}`;
  }

  function head(title, description, actions = '') { return `<div class="local-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="local-actions">${actions}</div></div>`; }
  function dashboard() {
    const courses8 = effectiveCourses('class', today).filter((entry) => entry.value);
    const coursesMe = effectiveCourses('teacher', today).filter((entry) => entry.value);
    const todos = read(LOCAL_KEYS.todos, []).filter((item) => !item.done).sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const notes = read(LOCAL_KEYS.notes, []).slice(-5).reverse();
    return head('今日看板', '本地业务总览；记录只保存在当前设备。') + `<div class="local-grid">
      ${panel('今日我的课程', courseList(coursesMe, '还没有填写我的课表'), 'local-span-5')}
      ${panel('今日 8 班课程', courseList(courses8, '还没有填写8班课表'), 'local-span-4')}
      ${panel('临时调课', `<div class="local-notice">按日期单独保存临时安排，常规课表不会被覆盖。</div><div class="local-actions-row">${button('打开临时调课', 'temporary-schedule', 'primary')}</div>`, 'local-span-3')}
      ${panel('待办事项', todos.length ? `<div class="local-todos">${todos.slice(0, 5).map(todoRow).join('')}</div><div class="local-actions-row">${button('管理待办', 'todos', 'small')}</div>` : empty('暂时没有未完成待办'), 'local-span-7')}
      ${panel('快捷记录', `<div class="local-list">${button('记录一条内容', 'new-note', 'small')} ${button('记录8班事项', 'new-violation', 'small')} ${button('记录作业反馈', 'new-homework', 'small')} ${button('调整今日课表', 'schedule', 'small')}</div>`, 'local-span-5')}
      ${panel('最近快捷记录', notes.length ? `<div class="local-list">${notes.map((item) => `<div class="local-item"><span class="local-period">${fmtDate(item.date)}</span><div><strong>${esc(item.text)}</strong><small>${esc(item.createdAt || '')}</small></div></div>`).join('')}</div>` : empty('还没有快捷记录'), 'local-span-12')}
    </div>`;
  }
  function courseList(entries, noText) { return entries.length ? `<div class="local-list">${entries.slice(0, 8).map((entry, i) => `<div class="local-item ${i === 0 ? 'current' : ''}"><span class="local-period">${esc(entry.period)}</span><div><strong>${esc(entry.value)}</strong><small>${i === 0 ? '当前安排' : '常规课表'}</small></div><span class="local-dot ${i === 0 ? 'current' : ''}"></span></div>`).join('')}</div>` : empty(noText); }
  function todoRow(item) { return `<label class="local-todo"><input type="checkbox" data-todo-done="${attr(item.id)}" ${item.done ? 'checked' : ''}><span class="${item.due && item.due < today ? 'local-overdue' : ''}">${esc(item.text)}</span><small>${fmtDate(item.due)}</small></label>`; }

  function rosterPage() {
    const number = state.rosterClass;
    const list = rosterFor(number);
    return head('姓名目录', '7班和8班均提供姓名目录；完整档案仅限8班。', `<select class="local-select" data-roster-class><option value="8"${number === '8' ? ' selected' : ''}>${class8Name}</option><option value="7"${number === '7' ? ' selected' : ''}>${class7Name}</option></select>`) + panel(classLabel(number), list.length ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>序号</th><th>姓名</th>${number === '8' ? '<th>准考证号</th><th>省学籍辅号</th>' : ''}</tr></thead><tbody>${list.map((student, index) => `<tr><td>${index + 1}</td><td>${esc(student.name)}</td>${number === '8' ? `<td>${esc(student.examNumber)}</td><td>${esc(student.provincialStudentNumber)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : empty('没有可显示的学生目录'), 'local-span-12');
  }

  function classManagement() {
    const tab = state.managementTab || 'roster';
    const tabs = [['roster', '花名册'], ['profile', '学生信息'], ['groups', '分组表'], ['seating', '座次表']];
    const body = tab === 'roster' ? managementRoster() : tab === 'profile' ? managementProfile() : tab === 'groups' ? layoutPage('groups') : layoutPage('seating');
    return head('8班班级管理', '花名册、学生信息、分组表与座次表彼此独立，数据只保存在本地。') + `<div class="local-tabs">${tabs.map(([id, label]) => `<button type="button" class="${tab === id ? 'active' : ''}" data-management-tab="${id}">${label}</button>`).join('')}</div>${body}`;
  }
  function managementRoster() {
    return panel('8班花名册', `<div class="local-notice">只读展示姓名、身份证件号、省学籍辅号和准考证号。资料来自本机私有种子，不会写入新增代码或日志。</div><div class="local-table-wrap"><table class="local-table"><thead><tr><th>序号</th><th>姓名</th><th>身份证件号</th><th>省学籍辅号</th><th>准考证号</th></tr></thead><tbody>${roster8.map((student, index) => `<tr><td>${index + 1}</td><td>${esc(student.name)}</td><td>${esc(student.identityNumber)}</td><td>${esc(student.provincialStudentNumber)}</td><td>${esc(student.examNumber)}</td></tr>`).join('')}</tbody></table></div>`, 'local-span-12');
  }
  function managementProfile() {
    const selected = roster8.find((student) => student.id === state.selectedStudent) || roster8[0];
    if (!selected) return panel('学生信息', empty('没有可显示的学生档案'), 'local-span-12');
    const profile = selected.profile || {};
    const fields = Object.keys(profile).length ? Object.entries(profile).map(([key, value]) => `<div class="local-field-value"><label>${esc(key)}</label><div>${esc(value)}</div></div>`).join('') : empty('该学生没有档案字段');
    return `<div class="local-profile"><section class="local-panel"><div class="local-panel-title" style="padding:18px 20px 0"><h3>8班学生</h3></div><div class="local-student-list">${roster8.map((student) => `<div class="local-student ${student.id === selected.id ? 'selected' : ''}" data-select-student="${student.id}"><span>${esc(student.name)}</span><small>${student.sortOrder + 1}</small></div>`).join('')}</div></section>${panel(selected.name, `<div class="local-fields">${fields}</div>`, '')}</div>`;
  }

  function schedulePage() {
    const type = state.scheduleType;
    const effectiveType = type === 'temporary' ? 'class' : type;
    const selectedDay = type === 'temporary' ? currentWeekday(state.temporaryDate) : null;
    const dateTools = type === 'temporary' ? `<input class="local-input" type="date" data-temporary-date value="${attr(state.temporaryDate)}"><span class="local-muted">${selectedDay ? `只编辑${selectedDay}` : '周末不开放保存'}</span>` : '';
    const saveDisabled = type === 'temporary' && !selectedDay;
    const cells = slots.map((period) => `<tr><td>${esc(period)}</td>${weekdays.map((day) => {
      const editable = type !== 'temporary' || day === selectedDay;
      const value = scheduleValue(effectiveType, day, period, type === 'temporary' ? state.temporaryDate : null);
      return editable ? `<td><textarea class="local-schedule-cell" data-schedule-type="${effectiveType}" data-schedule-day="${day}" data-schedule-period="${period}" placeholder="填写${effectiveType === 'teacher' ? '班级' : '课程'}">${esc(value)}</textarea></td>` : '<td class="local-readonly">仅查看</td>';
    }).join('')}</tr>`).join('');
    return head('课程表', '周一至周五直接填写；临时调课按日期保存，不改变常规课表。', `<div class="local-toolbar">${dateTools}${button('保存当前课表', 'save-schedule', `primary ${saveDisabled ? 'disabled' : ''}`)}</div>`) + `<div class="local-tabs"><button type="button" class="${type === 'class' ? 'active' : ''}" data-schedule-type="class">8班班级课表</button><button type="button" class="${type === 'teacher' ? 'active' : ''}" data-schedule-type="teacher">我的课表</button><button type="button" class="${type === 'temporary' ? 'active' : ''}" data-schedule-type="temporary">临时调课</button></div>${panel(type === 'teacher' ? '我的课表' : type === 'temporary' ? `临时调课 · ${fmtDate(state.temporaryDate)}` : '8班班级课表', `<div class="local-schedule"><table><thead><tr><th>时段</th>${weekdays.map((day) => `<th>${day}</th>`).join('')}</tr></thead><tbody>${cells}</tbody></table></div>`, 'local-span-12')}`;
  }
  function scheduleValue(type, day, period, date) { const schedules = read(LOCAL_KEYS.schedule, {}); if (date) return (read(LOCAL_KEYS.overrides, {})[`${date}:${slots.indexOf(period)}`] || {})[day] || ''; return schedules[`${type}:${day}:${period}`] || ''; }
  function effectiveCourses(type, date) { const day = currentWeekday(date); return day ? slots.map((period) => ({ period, value: scheduleValue(type, day, period, type === 'class' ? date : null) })) : []; }

  function violationsPage() {
    const items = read(LOCAL_KEYS.violations, []).sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return head('8班违纪记录', '只按日期、学生和具体事项记录，方便回看学生历史。', button('新增记录', 'new-violation', 'primary')) + panel('记录列表', items.length ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>日期</th><th>学生</th><th>具体内容</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td>${fmtDate(item.date)}</td><td>${esc(item.student)}</td><td>${esc(item.text)}</td><td>${button('删除', `delete-violation:${item.id}`, 'small danger')}</td></tr>`).join('')}</tbody></table></div>` : empty('还没有违纪记录'), 'local-span-12');
  }
  function homeworkPage() {
    const number = state.homeworkClass; const data = read(LOCAL_KEYS.homework, {}); const key = `${number}:${state.homeworkDate}`; const records = data[key] || {};
    const rows = rosterFor(number).map((student) => `<tr><td>${esc(student.name)}</td><td><select class="local-select homework-rating" data-homework-student="${student.id}"><option${(records[student.id]?.rating || '优') === '优' ? ' selected' : ''}>优</option><option${records[student.id]?.rating === '良' ? ' selected' : ''}>良</option><option${records[student.id]?.rating === '差' ? ' selected' : ''}>差</option></select></td><td><input class="local-input homework-note" data-homework-note="${student.id}" value="${attr(records[student.id]?.note || '')}" placeholder="备注"></td></tr>`).join('');
    return head('作业反馈', '7班、8班按日期分别保存；默认全体为“优”。', `<select class="local-select" data-homework-class><option value="8"${number === '8' ? ' selected' : ''}>${class8Name}</option><option value="7"${number === '7' ? ' selected' : ''}>${class7Name}</option></select><input class="local-input" type="date" data-homework-date value="${state.homeworkDate}">${button('保存反馈', 'save-homework', 'primary')}`) + panel(`${classLabel(number)} · ${fmtDate(state.homeworkDate)}`, `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>姓名</th><th>评价</th><th>备注</th></tr></thead><tbody>${rows}</tbody></table></div>`, 'local-span-12');
  }
  function dictationPage() {
    const all = read(LOCAL_KEYS.dictation, []); const sheets = all.filter((sheet) => sheet.classNumber === state.dictationClass); const active = sheets.find((sheet) => sheet.id === state.selectedDictation) || sheets[0];
    const selector = `<select class="local-select" data-dictation-sheet>${sheets.map((sheet) => `<option value="${sheet.id}"${active && sheet.id === active.id ? ' selected' : ''}>${esc(sheet.title)}</option>`).join('')}</select>`;
    const table = active ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>姓名</th><th>目标分</th>${active.columns.map((column) => `<th>${esc(column.date)} ${esc(column.name)}</th>`).join('')}<th>状态</th></tr></thead><tbody>${rosterFor(state.dictationClass).map((student) => { const target = active.targets[student.id] ?? ''; const scores = active.columns.map((column) => active.scores[`${student.id}:${column.id}`] ?? ''); const completed = scores.filter((score) => score !== '').every((score) => Number(score) >= Number(target || 0)); const status = scores.length && scores.every((score) => score !== '') ? (completed ? '<span class="local-badge good">达成</span>' : '<span class="local-badge bad">未达成</span>') : '<span class="local-badge blue">进行中</span>'; return `<tr><td>${esc(student.name)}</td><td><input class="local-input dict-target" data-student="${student.id}" value="${attr(target)}" type="number" min="0" max="100"></td>${active.columns.map((column, index) => `<td><input class="local-input dict-score" data-student="${student.id}" data-column="${column.id}" value="${attr(scores[index])}" type="number" min="0" max="100"></td>`).join('')}<td>${status}</td></tr>`; }).join('')}</tbody></table></div>` : empty('还没有听写阶段，点击“新建阶段”开始。');
    return head('听写成绩', '每个阶段独立建表，满分100；只计算达成状态，不排名。', `${selectField('', 'dictationClass', [['8', class8Name], ['7', class7Name]], state.dictationClass).replace('<label></label>', '')}${selector}${button('新建阶段', 'new-dictation', 'small')}${active ? button('新增听写', 'new-dictation-column', 'small') : ''}${active ? button('保存本阶段', 'save-dictation', 'primary') : ''}`) + (active ? panel(active.title, table, 'local-span-12') : panel('听写阶段', table, 'local-span-12'));
  }
  function testsPage() {
    const tests = read(LOCAL_KEYS.tests, []).filter((item) => item.classNumber === state.testClass); const active = tests.find((item) => item.id === state.selectedTest) || tests[0];
    const selector = `<select class="local-select" data-test-sheet>${tests.map((item) => `<option value="${item.id}"${active && active.id === item.id ? ' selected' : ''}>${esc(item.title)}</option>`).join('')}</select>`;
    const rows = active ? rosterFor(state.testClass).map((student) => `<tr><td>${esc(student.name)}</td><td><input class="local-input test-score" type="number" min="0" max="${active.fullScore}" data-student="${student.id}" value="${attr(active.scores[student.id] ?? '')}"></td><td>${rankFor(active, student.id)}</td><td>${active.references?.[student.id] ? `${active.references[student.id]} → ${rankFor(active, student.id)}` : '—'}</td></tr>`).join('') : '';
    return head('单元测试', '每次测试独立建表，录入成绩后自动计算当前排名。', `${selectField('', 'testClass', [['8', class8Name], ['7', class7Name]], state.testClass).replace('<label></label>', '')}${selector}${button('新建测试', 'new-test', 'small')}${active ? button('保存成绩', 'save-test', 'primary') : ''}`) + panel(active ? `${active.title} · 满分${active.fullScore}` : '单元测试', active ? `<div class="local-table-wrap"><table class="local-table"><thead><tr><th>姓名</th><th>成绩</th><th>当前排名</th><th>历史排名对照</th></tr></thead><tbody>${rows}</tbody></table></div>` : empty('还没有测试，点击“新建测试”开始。'), 'local-span-12');
  }
  function rankFor(test, studentId) { const score = test.scores[studentId]; if (score === '' || score == null) return '—'; const sorted = Object.entries(test.scores).filter(([, value]) => value !== '' && value != null).sort((a, b) => Number(b[1]) - Number(a[1])); const index = sorted.findIndex(([id]) => id === studentId); return index < 0 ? '—' : String(index + 1); }

  function planningPage() {
    const items = read(LOCAL_KEYS.planning, []).filter((item) => item.classNumber === state.planClass); return head('课程规划', '按单元组织课时内容，只保留内容和完成勾选。', button('新增单元', 'new-unit', 'primary')) + panel('课程规划', items.length ? `<div class="local-list">${items.map((unit) => `<div class="local-item"><div><strong>${esc(unit.title)}</strong><small>${unit.lessons.filter((lesson) => lesson.done).length}/${unit.lessons.length} 课时完成</small></div>${button('打开', `open-unit:${unit.id}`, 'small')}</div>`).join('')}</div>` : empty('还没有规划内容，点击“新增单元”开始。'), 'local-span-12');
  }
  function resourcesPage() { const links = read(LOCAL_KEYS.resources, []); return head('资源库', '常用网站与工作文件在本地分别管理。', button('添加网址', 'new-resource', 'primary')) + `<div class="local-tabs"><button type="button" class="${state.resourceTab === 'links' ? 'active' : ''}" data-resource-tab="links">常用网站</button><button type="button" class="${state.resourceTab === 'files' ? 'active' : ''}" data-resource-tab="files">工作文件</button></div>` + (state.resourceTab === 'links' ? panel('常用网站', links.length ? `<div class="local-list">${links.map((item) => `<div class="local-item"><div><strong>${esc(item.name)}</strong><small>${esc(item.category || '未分类')} · ${esc(item.note || '')}</small></div><a href="${attr(item.url)}" target="_blank" rel="noreferrer">打开</a>${button('删除', `delete-resource:${item.id}`, 'small danger')}</div>`).join('')}</div>` : empty('还没有常用网址'), 'local-span-12') : panel('工作文件', `<div class="local-notice">工作文件本地功能预留；当前版本支持网址记录，文件批量上传和预览在后续本地迭代实现。</div>`, 'local-span-12')); }
  function prepPage() { return head('备课中心', '独立网页入口，不共享本地工作台数据。') + panel('备课中心', `<div class="local-notice">尚未配置备课中心地址。配置完成后将在新标签页打开。</div>`, 'local-span-12'); }

  function layoutPage(kind) {
    const isGroup = kind === 'groups'; const layout = isGroup ? state.groupLayout : state.seatingLayout; const title = isGroup ? '分组表' : '座次表'; const actions = `${button('下载模板', `download-${kind}`, 'small')}${button('上传模板', `import-${kind}`, 'primary')}${layout ? button('打印', `print-${kind}`, 'small') : ''}`;
    const body = layout ? (isGroup ? groupPreview(layout) : seatingPreview(layout)) : empty(`还没有已确认的${title}`);
    return head(title, `固定模板导入、预览后确认；确认后才替换当前${title}。`, actions) + `<div class="local-notice">上传不会立即覆盖已保存布局。错误或取消会保留旧布局。</div>${panel(`当前${title}`, body, 'local-span-12')}`;
  }
  function groupPreview(layout) { return `<div class="local-list">${layout.groups.map((group) => `<div class="local-group-row"><strong>第${group.groupIndex}组</strong>${group.members.length ? group.members.map((member) => `<span class="local-chip ${member.isLeader ? 'leader' : ''}">${esc(member.displayName)}${member.isLeader ? ' · 组长' : ''}</span>`).join('') : '<span class="local-muted">暂无成员</span>'}</div>`).join('')}</div>`; }
  function seatingPreview(layout) { return `<div class="local-layout-grid" style="grid-template-columns:repeat(${layout.columnCount},minmax(55px,1fr))">${layout.cells.map((cell) => `<div class="local-seat ${cell.cellKind}">${cell.cellKind === 'student' ? esc(cell.displayName) : cell.cellKind === 'aisle' ? '过道' : cell.cellKind === 'podium' ? '讲台' : '空座'}</div>`).join('')}</div>`; }

  function modalHtml() {
    const modal = state.modal; let title = modal.title; let body = modal.body;
    if (modal.type === 'note') body = `<form data-form="note">${inputField('日期', 'date', today, 'date')}<div class="local-field full"><label>内容</label><textarea class="local-textarea" name="text" required></textarea></div><div class="local-actions-row">${button('取消', 'close-modal')}${button('保存记录', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'violation') body = `<form data-form="violation">${inputField('日期', 'date', today, 'date')}${selectField('学生', 'student', roster8.map((student) => [student.name, student.name]), '')}<div class="local-field full"><label>具体事项</label><textarea class="local-textarea" name="text" required></textarea></div><div class="local-actions-row">${button('取消', 'close-modal')}${button('保存记录', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'homework') body = `<form data-form="homework">${selectField('班级', 'classNumber', [['8', class8Name], ['7', class7Name]], state.homeworkClass)}${inputField('日期', 'date', today, 'date')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('打开反馈', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'todos') body = `<form data-form="todo">${inputField('事项内容', 'text', '', 'text', 'required')}${inputField('截止日期', 'due', today, 'date')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('保存待办', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'dictation') body = `<form data-form="dictation">${selectField('班级', 'classNumber', [['8', class8Name], ['7', class7Name]], state.dictationClass)}${inputField('阶段名称', 'title', '', 'text', 'required')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('新建阶段', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'dictation-column') body = `<form data-form="dictation-column">${inputField('日期', 'date', today, 'date')}${inputField('听写名称', 'name', '听写', 'text', 'required')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('添加听写', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'test') body = `<form data-form="test">${selectField('班级', 'classNumber', [['8', class8Name], ['7', class7Name]], state.testClass)}${inputField('测试名称', 'title', '', 'text', 'required')}${inputField('满分', 'fullScore', '100', 'number', 'min="1" required')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('新建测试', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'unit') body = `<form data-form="unit">${inputField('单元名称', 'title', '', 'text', 'required')}<div class="local-field full"><label>课时内容（每行一课时）</label><textarea class="local-textarea" name="lessons" required placeholder="输入课时内容"></textarea></div><div class="local-actions-row">${button('取消', 'close-modal')}${button('保存单元', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'resource') body = `<form data-form="resource">${inputField('名称', 'name', '', 'text', 'required')}${inputField('网址', 'url', 'https://', 'url', 'required')}${inputField('分类', 'category', '常用')}${inputField('备注', 'note', '')}<div class="local-actions-row">${button('取消', 'close-modal')}${button('保存网址', 'submit-form', 'primary')}</div></form>`;
    if (modal.type === 'import') body = importModal(modal.kind);
    return `<div class="local-modal-backdrop" data-modal-backdrop><div class="local-modal"><h3>${esc(title)}</h3>${body}</div></div>`;
  }
  function importModal(kind) { const pending = state.pendingImport; const errors = pending?.errors || []; const preview = pending?.layout ? (kind === 'groups' ? groupPreview(pending.layout) : seatingPreview(pending.layout)) : empty('选择模板文件后显示预览'); return `<div class="local-notice">${kind === 'groups' ? '表头：组别、成员1、成员2、成员3、成员4、组长' : '模板版本、1；行数、8、列数、9；后续为8×9座位结构'}</div><div class="local-field"><label>选择 CSV 或 XLSX 文件</label><input type="file" data-template-file accept=".csv,.xlsx,.xls"></div>${errors.length ? `<div class="local-error">${errors.map((error) => `<div>${esc(error)}</div>`).join('')}</div>` : ''}<div class="local-import-preview">${preview}</div><div class="local-actions-row">${button('取消', 'cancel-import')}${button('确认保存', 'confirm-import', `primary ${!pending?.layout || errors.length ? 'disabled' : ''}`)}</div>`; }

  function parseGroup(rows) {
    const errors = []; const expected = ['组别', '成员1', '成员2', '成员3', '成员4', '组长']; const header = (rows[0] || []).map((value) => String(value ?? '').trim()); if (header.join('|') !== expected.join('|')) return { errors: ['分组模板表头或列数不匹配'] }; const groups = []; const names = new Set(); const indexes = new Set();
    rows.slice(1).forEach((row, offset) => { const line = offset + 2; if (row.length !== expected.length) errors.push(`第${line}行列数不匹配`); const groupIndex = Number(String(row[0] ?? '').trim()); if (!Number.isInteger(groupIndex) || groupIndex < 1) { errors.push(`第${line}行组别无效`); return; } if (indexes.has(groupIndex)) errors.push(`组别重复：${groupIndex}`); indexes.add(groupIndex); const leader = String(row[5] ?? '').trim(); const members = []; for (let slot = 0; slot < 4; slot += 1) { const name = String(row[slot + 1] ?? '').trim(); if (!name) continue; const student = studentMap.get(name); if (!student || !roster8.some((item) => item.name === name)) errors.push(`第${line}行未知姓名：${name}`); else if (names.has(student.id)) errors.push(`第${line}行学生重复：${name}`); else names.add(student.id); members.push({ studentId: student?.id || `invalid-${line}-${slot}`, displayName: name, groupIndex, slotIndex: slot, isLeader: name === leader }); } if (leader && !members.some((member) => member.displayName === leader)) errors.push(`第${line}行组长不是本组成员：${leader}`); groups.push({ groupIndex, members }); });
    return { layout: errors.length ? undefined : { templateVersion: 1, groups }, errors };
  }
  function parseSeating(rows) {
    const errors = []; const first = (rows[0] || []).map((v) => String(v ?? '').trim()); const second = (rows[1] || []).map((v) => String(v ?? '').trim()); if (first.join('|') !== '模板版本|1' || second.join('|') !== '行数|8|列数|9') return { errors: ['座次模板版本、行数或列数不匹配'] }; if (rows.length !== 10) errors.push('座次模板必须包含8行座位数据'); const cells = []; const seen = new Set(); rows.slice(2, 10).forEach((row, rowIndex) => { if (row.length !== 9) errors.push(`第${rowIndex + 3}行列数不匹配`); for (let columnIndex = 0; columnIndex < 9; columnIndex += 1) { const raw = String(row[columnIndex] ?? '').trim(); const parts = raw.split(':'); const kind = parts.shift().toLowerCase(); const cellKind = { student: 'student', empty: 'empty', aisle: 'aisle', podium: 'podium' }[kind]; if (!cellKind) { errors.push(`第${rowIndex + 3}行第${columnIndex + 1}列结构标记未知`); continue; } const name = parts.join(':').trim(); const student = cellKind === 'student' ? studentMap.get(name) : null; if (cellKind === 'student' && (!student || !roster8.some((item) => item.name === name))) errors.push(`第${rowIndex + 3}行第${columnIndex + 1}列未知姓名：${name}`); if (student && seen.has(student.id)) errors.push(`学生重复出现在座次表：${name}`); if (student) seen.add(student.id); cells.push({ rowIndex, columnIndex, cellKind, studentId: student?.id, displayName: student?.name }); } });
    if (cells.length && cells[0].cellKind !== 'podium') errors.push('座次表第1行第1列必须为讲台结构'); if (cells.length && cells[4].cellKind !== 'aisle') errors.push('座次表第1行第5列必须为过道结构'); for (let row = 0; row < 8; row += 1) { const podium = cells.find((cell) => cell.rowIndex === row && cell.columnIndex === 0); if (row === 0 && podium?.cellKind !== 'podium') errors.push('座次表第1行讲台位置不正确'); const aisle = cells.find((cell) => cell.rowIndex === row && cell.columnIndex === 4); if (aisle?.cellKind !== 'aisle') errors.push(`座次表第${row + 1}行第5列必须为过道结构`); } return { layout: errors.length ? undefined : { templateVersion: 1, rowCount: 8, columnCount: 9, cells }, errors };
  }
  function readRows(file, callback) { const reader = new FileReader(); reader.onload = () => { try { if (window.XLSX && /\.xlsx?$/i.test(file.name)) { const workbook = window.XLSX.read(reader.result, { type: 'array' }); callback(window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' })); } else callback(String(reader.result).split(/\r?\n/).filter((line) => line.trim() !== '').map((line) => line.split(',').map((value) => value.trim().replace(/^"|"$/g, '')))); } catch (error) { callback(null, [error.message || '文件读取失败']); } }; reader.onerror = () => callback(null, ['文件读取失败']); reader.readAsArrayBuffer(file); }

  function render() { const content = state.page === 'dashboard' ? dashboard() : state.page === 'class-management' ? classManagement() : state.page === 'roster' ? rosterPage() : state.page === 'schedule' ? schedulePage() : state.page === 'violations' ? violationsPage() : state.page === 'homework' ? homeworkPage() : state.page === 'dictation' ? dictationPage() : state.page === 'tests' ? testsPage() : state.page === 'planning' ? planningPage() : state.page === 'resources' ? resourcesPage() : prepPage(); root.innerHTML = shell(content); }
  function openModal(type, title, extra = {}) { state.modal = { type, title, ...extra }; render(); }
  function closeModal() { state.modal = null; state.pendingImport = null; render(); }
  function formData(form) { return Object.fromEntries(new FormData(form).entries()); }
  function saveSchedule() { const schedules = read(LOCAL_KEYS.schedule, {}); const overrides = read(LOCAL_KEYS.overrides, {}); document.querySelectorAll('.local-schedule-cell').forEach((cell) => { const value = cell.value.trim(); if (state.scheduleType === 'temporary') { const key = `${state.temporaryDate}:${slots.indexOf(cell.dataset.schedulePeriod)}`; overrides[key] = { ...(overrides[key] || {}), [cell.dataset.scheduleDay]: value }; } else schedules[`${cell.dataset.scheduleType}:${cell.dataset.scheduleDay}:${cell.dataset.schedulePeriod}`] = value; }); write(LOCAL_KEYS.schedule, schedules); write(LOCAL_KEYS.overrides, overrides); toast('课表已保存到本地'); }
  function saveHomework() { const data = read(LOCAL_KEYS.homework, {}); const key = `${state.homeworkClass}:${state.homeworkDate}`; data[key] = {}; document.querySelectorAll('.homework-rating').forEach((select) => { const id = select.dataset.homeworkStudent; data[key][id] = { rating: select.value, note: document.querySelector(`[data-homework-note="${CSS.escape(id)}"]`)?.value.trim() || '' }; }); write(LOCAL_KEYS.homework, data); toast('作业反馈已保存'); }
  function saveDictation() { const all = read(LOCAL_KEYS.dictation, []); const sheet = all.find((item) => item.id === state.selectedDictation); if (!sheet) return; document.querySelectorAll('.dict-target').forEach((input) => { sheet.targets[input.dataset.student] = input.value === '' ? '' : Number(input.value); }); document.querySelectorAll('.dict-score').forEach((input) => { sheet.scores[`${input.dataset.student}:${input.dataset.column}`] = input.value === '' ? '' : Number(input.value); }); write(LOCAL_KEYS.dictation, all); toast('听写成绩已保存'); render(); }
  function saveTest() { const all = read(LOCAL_KEYS.tests, []); const test = all.find((item) => item.id === state.selectedTest); if (!test) return; document.querySelectorAll('.test-score').forEach((input) => { test.scores[input.dataset.student] = input.value === '' ? '' : Number(input.value); }); write(LOCAL_KEYS.tests, all); toast('测试成绩已保存'); render(); }

  document.addEventListener('click', (event) => { const target = event.target.closest('[data-page],[data-action],[data-management-tab],[data-resource-tab],[data-schedule-type],[data-select-student]'); if (!target) return; if (target.dataset.page) { state.page = target.dataset.page; render(); return; } if (target.dataset.managementTab) { state.managementTab = target.dataset.managementTab; render(); return; } if (target.dataset.resourceTab) { state.resourceTab = target.dataset.resourceTab; render(); return; } if (target.dataset.scheduleType) { state.scheduleType = target.dataset.scheduleType; render(); return; } if (target.dataset.selectStudent) { state.selectedStudent = target.dataset.selectStudent; render(); return; }
    const action = target.dataset.action || ''; if (action === 'close-modal' || action === 'cancel-import') return closeModal(); if (action === 'data-info') return openModal('info', '本地数据说明', { body: '<div class="local-notice">此入口只使用浏览器本地存储，不读取云端配置、不调用云端接口。私有学生种子仅由本机页面加载。</div><div class="local-actions-row">' + button('知道了', 'close-modal', 'primary') + '</div>' }); if (action === 'schedule' || action === 'temporary-schedule') { state.page = 'schedule'; state.scheduleType = action === 'temporary-schedule' ? 'temporary' : 'class'; return render(); } if (action === 'todos') return openModal('todos', '新增待办'); if (action === 'new-note') return openModal('note', '记录快捷内容'); if (action === 'new-violation') return openModal('violation', '新增8班违纪记录'); if (action === 'new-homework') return openModal('homework', '打开作业反馈'); if (action === 'save-schedule') { if (target.classList.contains('disabled')) return; return saveSchedule(); } if (action === 'save-homework') return saveHomework(); if (action === 'new-dictation') return openModal('dictation', '新建听写阶段'); if (action === 'new-dictation-column') return openModal('dictation-column', '新增听写项目'); if (action === 'save-dictation') return saveDictation(); if (action === 'new-test') return openModal('test', '新建单元测试'); if (action === 'save-test') return saveTest(); if (action === 'new-unit') return openModal('unit', '新增课程单元'); if (action.startsWith('open-unit:')) return openUnit(action.slice(9)); if (action === 'new-resource') return openModal('resource', '添加常用网址'); if (action.startsWith('delete-resource:')) { const id = action.slice(15); write(LOCAL_KEYS.resources, read(LOCAL_KEYS.resources, []).filter((item) => item.id !== id)); return render(); } if (action.startsWith('delete-violation:')) { const id = action.slice(17); write(LOCAL_KEYS.violations, read(LOCAL_KEYS.violations, []).filter((item) => item.id !== id)); return render(); } if (action.startsWith('download-')) return downloadTemplate(action.slice(9)); if (action.startsWith('import-')) return chooseTemplate(action.slice(7)); if (action.startsWith('print-')) return printLayout(action.slice(6)); if (action === 'confirm-import') { if (!state.pendingImport?.layout) return; if (state.pendingImport.kind === 'groups') { state.groupLayout = state.pendingImport.layout; write(LOCAL_KEYS.groupLayout, state.groupLayout); } else { state.seatingLayout = state.pendingImport.layout; write(LOCAL_KEYS.seatingLayout, state.seatingLayout); } toast('布局已确认保存'); return closeModal(); } if (action === 'submit-form') { const form = target.closest('form'); if (form) form.requestSubmit(); }
  });
  document.addEventListener('change', (event) => { const el = event.target; if (el.matches('[data-roster-class]')) { state.rosterClass = el.value; render(); } else if (el.matches('[data-homework-class]')) { state.homeworkClass = el.value; render(); } else if (el.matches('[data-homework-date]')) { state.homeworkDate = el.value; render(); } else if (el.matches('[data-temporary-date]')) { state.temporaryDate = el.value; render(); } else if (el.matches('[data-dictation-sheet]')) { state.selectedDictation = el.value; render(); } else if (el.matches('[data-test-sheet]')) { state.selectedTest = el.value; render(); } else if (el.matches('[data-template-file]')) { const file = el.files[0]; if (!file) return; readRows(file, (rows, fileErrors) => { const parsed = rows ? (state.pendingImport?.kind === 'groups' ? parseGroup(rows) : parseSeating(rows)) : { errors: fileErrors }; state.pendingImport = { kind: state.pendingImport?.kind, ...parsed }; render(); }); } });
  document.addEventListener('input', (event) => { const el = event.target; if (el.matches('.local-schedule-cell')) return; });
  document.addEventListener('submit', (event) => { const form = event.target; const values = formData(form); event.preventDefault(); const type = form.dataset.form; if (type === 'note') { const items = read(LOCAL_KEYS.notes, []); items.push({ id: uid('note'), date: values.date, text: values.text.trim(), createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }); write(LOCAL_KEYS.notes, items); closeModal(); toast('快捷记录已保存'); } else if (type === 'violation') { const items = read(LOCAL_KEYS.violations, []); items.push({ id: uid('violation'), date: values.date, student: values.student, text: values.text.trim() }); write(LOCAL_KEYS.violations, items); closeModal(); toast('违纪记录已保存'); } else if (type === 'homework') { state.homeworkClass = values.classNumber; state.homeworkDate = values.date; state.page = 'homework'; closeModal(); } else if (type === 'todo') { const items = read(LOCAL_KEYS.todos, []); items.push({ id: uid('todo'), text: values.text.trim(), due: values.due, done: false }); write(LOCAL_KEYS.todos, items); closeModal(); toast('待办已保存'); } else if (type === 'dictation') { const all = read(LOCAL_KEYS.dictation, []); const item = { id: uid('dictation'), classNumber: values.classNumber, title: values.title.trim(), columns: [], targets: {}, scores: {} }; all.push(item); write(LOCAL_KEYS.dictation, all); state.dictationClass = values.classNumber; state.selectedDictation = item.id; closeModal(); toast('听写阶段已创建'); } else if (type === 'dictation-column') { const all = read(LOCAL_KEYS.dictation, []); const sheet = all.find((item) => item.id === state.selectedDictation); if (sheet) { sheet.columns.push({ id: uid('column'), date: values.date, name: values.name.trim() }); write(LOCAL_KEYS.dictation, all); } closeModal(); toast('听写项目已添加'); } else if (type === 'test') { const all = read(LOCAL_KEYS.tests, []); const item = { id: uid('test'), classNumber: values.classNumber, title: values.title.trim(), fullScore: Number(values.fullScore) || 100, scores: {}, references: {} }; all.push(item); write(LOCAL_KEYS.tests, all); state.testClass = values.classNumber; state.selectedTest = item.id; closeModal(); toast('测试已创建'); } else if (type === 'unit') { const all = read(LOCAL_KEYS.planning, []); const lessons = values.lessons.split(/\r?\n/).map((text) => text.trim()).filter(Boolean).map((text) => ({ id: uid('lesson'), text, done: false })); all.push({ id: uid('unit'), classNumber: state.planClass, title: values.title.trim(), lessons }); write(LOCAL_KEYS.planning, all); closeModal(); toast('课程单元已保存'); } else if (type === 'resource') { const all = read(LOCAL_KEYS.resources, []); all.push({ id: uid('resource'), name: values.name.trim(), url: values.url.trim(), category: values.category.trim(), note: values.note.trim() }); write(LOCAL_KEYS.resources, all); closeModal(); toast('网址已保存'); } });
  document.addEventListener('change', (event) => { const el = event.target; if (el.matches('[data-todo-done]')) { const items = read(LOCAL_KEYS.todos, []); const item = items.find((entry) => entry.id === el.dataset.todoDone); if (item) item.done = el.checked; write(LOCAL_KEYS.todos, items); render(); } });
  function openUnit(id) { const unit = read(LOCAL_KEYS.planning, []).find((item) => item.id === id); if (!unit) return; openModal('unit-detail', unit.title, { body: `<div class="local-list">${unit.lessons.map((lesson) => `<label class="local-todo"><input type="checkbox" data-lesson-done="${lesson.id}" data-unit="${unit.id}" ${lesson.done ? 'checked' : ''}><span>${esc(lesson.text)}</span></label>`).join('')}</div><div class="local-actions-row">${button('关闭', 'close-modal', 'primary')}</div>` }); }
  document.addEventListener('change', (event) => { const el = event.target; if (el.matches('[data-lesson-done]')) { const all = read(LOCAL_KEYS.planning, []); const unit = all.find((item) => item.id === el.dataset.unit); const lesson = unit?.lessons.find((item) => item.id === el.dataset.lessonDone); if (lesson) lesson.done = el.checked; write(LOCAL_KEYS.planning, all); } });
  function chooseTemplate(kind) { state.pendingImport = { kind, layout: null, errors: [] }; openModal('import', kind === 'groups' ? '导入分组模板' : '导入座次模板', { kind }); }
  function downloadTemplate(kind) { const content = kind === 'groups' ? '组别,成员1,成员2,成员3,成员4,组长\n1,,,,,\n' : '模板版本,1\n行数,8,列数,9\n' + Array.from({ length: 8 }, (_, row) => Array.from({ length: 9 }, (_, column) => row === 0 && column === 0 ? 'PODIUM' : column === 4 ? 'AISLE' : 'EMPTY').join(',')).join('\n') + '\n'; const blob = new Blob([content], { type: 'text/csv;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = kind === 'groups' ? 'group-layout-v1.csv' : 'seating-layout-v1.csv'; link.click(); URL.revokeObjectURL(link.href); }
  function printLayout(kind) { const layout = kind === 'groups' ? state.groupLayout : state.seatingLayout; if (!layout) return; const title = kind === 'groups' ? `${class8Name} 分组表` : `${class8Name} 座次表`; const printWindow = window.open('', '_blank'); if (!printWindow) return toast('浏览器阻止了打印窗口'); printWindow.document.write(`<html><head><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Arial,"Microsoft YaHei",sans-serif;color:#17212b}h1{font-size:22px;font-weight:600;margin:0 0 18px}.group{display:flex;gap:8px;align-items:center;border-bottom:1px solid #dce3e7;padding:10px 0}.group strong{width:70px}.chip{border:1px solid #ccd7dc;padding:6px 9px}.grid{display:grid;grid-template-columns:repeat(9,1fr);gap:5px}.seat{min-height:38px;border:1px solid #ccd7dc;display:grid;place-items:center;font-size:12px}.podium{background:#dceeff;font-weight:bold}.aisle{background:#f0f2f3;color:#67737c}.empty{background:#fafbfb;color:#a0aab1}</style></head><body><h1>${esc(title)}</h1>${kind === 'groups' ? layout.groups.map((group) => `<div class="group"><strong>第${group.groupIndex}组</strong>${group.members.map((member) => `<span class="chip">${esc(member.displayName)}${member.isLeader ? ' · 组长' : ''}</span>`).join('')}</div>`).join('') : `<div class="grid">${layout.cells.map((cell) => `<div class="seat ${cell.cellKind}">${cell.cellKind === 'student' ? esc(cell.displayName) : cell.cellKind === 'aisle' ? '过道' : cell.cellKind === 'podium' ? '讲台' : '空座'}</div>`).join('')}</div>`}</body></html>`); printWindow.document.close(); printWindow.focus(); printWindow.print(); }
  render();
})();
