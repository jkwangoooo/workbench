import { empty, esc, head, panel } from '../core/dom.js';
import { roster8 } from '../core/roster.js';
import { state } from '../core/state.js';
import { layoutPage } from './layouts.js';

export function classManagement() {
  const tab = state.managementTab || 'roster';
  const tabs = [
    ['roster', '花名册'],
    ['profile', '学生信息'],
    ['groups', '分组表'],
    ['seating', '座次表']
  ];
  const body =
    tab === 'roster' ? managementRoster() : tab === 'profile' ? managementProfile() : tab === 'groups' ? layoutPage('groups') : layoutPage('seating');
  return (
    head('8班班级管理', '花名册、学生信息、分组表与座次表彼此独立，数据只保存在本地。') +
    `<div class="local-tabs">${tabs.map(([id, label]) => `<button type="button" class="${tab === id ? 'active' : ''}" data-management-tab="${id}">${label}</button>`).join('')}</div>${body}`
  );
}
export function managementRoster() {
  return panel(
    '8班花名册',
    `<div class="local-notice">只读展示姓名、身份证件号、省学籍辅号和准考证号。资料来自本机私有种子，不会写入新增代码或日志。</div><div class="local-table-wrap"><table class="local-table"><thead><tr><th>序号</th><th>姓名</th><th>身份证件号</th><th>省学籍辅号</th><th>准考证号</th></tr></thead><tbody>${roster8.map((student, index) => `<tr><td>${index + 1}</td><td>${esc(student.name)}</td><td>${esc(student.identityNumber)}</td><td>${esc(student.provincialStudentNumber)}</td><td>${esc(student.examNumber)}</td></tr>`).join('')}</tbody></table></div>`,
    'local-span-12'
  );
}
export function managementProfile() {
  const selected = roster8.find((student) => student.id === state.selectedStudent) || roster8[0];
  if (!selected) return panel('学生信息', empty('没有可显示的学生档案'), 'local-span-12');
  const profile = selected.profile || {};
  const fields = Object.keys(profile).length
    ? Object.entries(profile)
        .map(([key, value]) => `<div class="local-field-value"><label>${esc(key)}</label><div>${esc(value)}</div></div>`)
        .join('')
    : empty('该学生没有档案字段');
  return `<div class="local-profile"><section class="local-panel"><div class="local-panel-title" style="padding:18px 20px 0"><h3>8班学生</h3></div><div class="local-student-list">${roster8.map((student) => `<div class="local-student ${student.id === selected.id ? 'selected' : ''}" data-select-student="${student.id}"><span>${esc(student.name)}</span><small>${student.sortOrder + 1}</small></div>`).join('')}</div></section>${panel(selected.name, `<div class="local-fields">${fields}</div>`, '')}</div>`;
}
