import { LOCAL_KEYS } from './constants.js';
import { today } from './date.js';
import { read } from './storage.js';

export const state = {
  page: 'dashboard',
  scheduleType: 'class',
  temporaryDate: today,
  selectedStudent: null,
  rosterClass: '8',
  profileClass: '8',
  homeworkClass: '8',
  homeworkDate: today,
  // 作业反馈页（需求 §4）：当前录入的作业编号、草稿（三条内容 + 每条各自的反馈）、
  // 保存失败的原因、等待二次确认的删除。
  homeworkSlot: null,
  homeworkDraft: null,
  homeworkError: null,
  homeworkPendingDelete: null,
  // 面谈页（需求 §5）：班级、工作周（周一日期）、草稿、保存失败原因
  interviewClass: '8',
  interviewWeekStart: null,
  interviewDraft: null,
  interviewError: null,
  dictationClass: '8',
  selectedDictation: null,
  testClass: '8',
  selectedTest: null,
  planClass: '8',
  resourceTab: 'links',
  groupLayout: read(LOCAL_KEYS.groupLayout, null),
  seatingLayout: read(LOCAL_KEYS.seatingLayout, null),
  pendingImport: null,
  pendingBackup: null,
  // 违纪页（需求 §3）：日期、当天草稿、本次会话的编辑顺序、整批保存失败的原因、待确认的跳转。
  violationsDate: today,
  violationsDraft: null,
  violationsSessionOrder: [],
  violationsError: null,
  pendingNav: null,
  modal: null
};
