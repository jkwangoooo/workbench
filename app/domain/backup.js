import { EXPORT_KEYS } from '../core/constants.js';
import { roster7, roster8 } from '../core/roster.js';
import { fnv1a } from '../core/student-id.js';
import { read } from '../core/storage.js';

export const BACKUP_APP = 'teacher-workbench';
export const BACKUP_SCHEMA = 1;

// read(key, MISSING) 用它区分「这个键没存过」和「存的是 null」，
// 这样导出和迁移都不会凭空造出不存在的键。
const MISSING = Symbol('missing');

// 学生名单本身不在浏览器里，而作业/成绩/座次全以学生 ID 为外键。
// 备份只记下名单的「人数 + 指纹」，恢复时用它比对，避免把记录恢复到另一份名单上。
export function rosterProfile() {
  const ids8 = roster8.map((student) => student.id);
  const ids7 = roster7.map((student) => student.id);
  return { count8: ids8.length, count7: ids7.length, fingerprint: fnv1a(ids8.concat(ids7).join('|')) };
}

// 从当前浏览器收齐可备份的数据；参数便于测试注入替身。
export function collectData(reading = read) {
  const data = {};
  for (const key of EXPORT_KEYS) {
    const value = reading(key, MISSING);
    if (value !== MISSING) data[key] = value;
  }
  return data;
}

export function buildBackup(data, exportedAt = new Date().toISOString(), roster = rosterProfile(), files = null) {
  return { app: BACKUP_APP, schema: BACKUP_SCHEMA, exportedAt, roster, data, files };
}

// 校验已解析成对象的备份。只接受本应用导出的格式，并丢弃白名单之外的键。
export function validateBackup(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['备份文件结构不正确'] };
  if (raw.app !== BACKUP_APP) return { ok: false, errors: ['这不是「班主任工作台」导出的备份文件'] };
  if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) return { ok: false, errors: ['备份文件缺少数据段'] };

  const data = {};
  const ignored = [];
  for (const [key, value] of Object.entries(raw.data)) {
    if (EXPORT_KEYS.includes(key)) data[key] = value;
    else ignored.push(key);
  }
  return {
    ok: true,
    errors: [],
    ignored,
    backup: {
      app: BACKUP_APP,
      schema: Number(raw.schema) || BACKUP_SCHEMA,
      exportedAt: String(raw.exportedAt || ''),
      roster: raw.roster && typeof raw.roster === 'object' ? raw.roster : null,
      data,
      files: raw.files && typeof raw.files === 'object' && !Array.isArray(raw.files) ? raw.files : null
    }
  };
}

export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(String(text));
  } catch (_) {
    return { ok: false, errors: ['文件不是合法的 JSON，无法解析'] };
  }
  return validateBackup(raw);
}

// 记录条数：数组看长度，对象看键数。布局类另由页面按语义计数。
export function countRecords(value) {
  if (value === null || value === undefined) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') return Object.keys(value).length;
  return 1;
}

export function backupFilename(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `workbench-backup-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
