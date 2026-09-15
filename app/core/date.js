import { weekdays } from './constants.js';

/**
 * 按本地时区格式化为 YYYY-MM-DD。
 * 不能用 toISOString()：它按 UTC 切日，北京时间 0:00–8:00 会算成前一天，
 * 早上第一节课录入的违纪文字、作业反馈会默认落在昨天那一栏。
 */
export function localDateStr(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const today = localDateStr();

export function fmtDate(value) {
  return value ? String(value).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日') : '';
}

export function fmtDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function currentWeekday(date) {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 ? null : day === 6 ? null : weekdays[day - 1];
}
