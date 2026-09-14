import { fmtDate, today } from '../core/date.js';
import { button, esc } from '../core/dom.js';
import { state } from '../core/state.js';
import { modalHtml } from './modal.js';

export function nav() {
  const sections = [
    ['工作台', [['dashboard', '今日看板']]],
    [
      '班级业务',
      [
        ['class-management', '8班班级管理'],
        ['roster', '姓名目录'],
        ['violations', '违纪记录'],
        ['homework', '作业反馈'],
        ['interviews', '学生面谈']
      ]
    ],
    [
      '成绩记录',
      [
        ['dictation', '听写成绩'],
        ['tests', '单元测试']
      ]
    ],
    [
      '课程与资料',
      [
        ['schedule', '课程表'],
        ['planning', '课程规划'],
        ['prep', '备课中心'],
        ['resources', '资源库']
      ]
    ],
    ['数据', [['data', '数据与备份']]]
  ];
  return sections
    .map(
      ([heading, items]) =>
        `<div class="local-nav-label">${esc(heading)}</div><nav class="local-nav">${items.map(([id, label]) => `<button type="button" class="${state.page === id ? 'active' : ''}" data-page="${id}">${esc(label)}</button>`).join('')}</nav>`
    )
    .join('');
}
export function shell(content) {
  const title =
    {
      dashboard: '今日看板',
      'class-management': '8班班级管理',
      roster: '姓名目录',
      violations: '违纪记录',
      homework: '作业反馈',
      interviews: '学生面谈',
      dictation: '听写成绩',
      tests: '单元测试',
      schedule: '课程表',
      planning: '课程规划',
      prep: '备课中心',
      resources: '资源库',
      data: '数据与备份'
    }[state.page] || '今日看板';
  return `<div class="local-shell"><aside class="local-sidebar"><div class="local-brand"><span class="local-mark">教</span><div><strong>班主任工作台</strong><small>本地业务版</small></div></div>${nav()}<div class="local-sidebar-foot">本地数据保存在当前浏览器<br>不连接云端，不上传资料</div></aside><main class="local-main"><header class="local-topbar"><div><div class="local-kicker">2025级 · 教学与班务</div><h1 class="local-title">${esc(title)}</h1></div><div class="local-actions"><span class="local-date">${fmtDate(today)}</span>${button('本地数据说明', 'data-info', 'small')}</div></header><div class="local-content">${content}</div></main></div>${state.modal ? modalHtml() : ''}`;
}
