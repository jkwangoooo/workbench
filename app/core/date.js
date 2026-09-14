import { weekdays } from './constants.js';

export const today = new Date().toISOString().slice(0, 10);

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
