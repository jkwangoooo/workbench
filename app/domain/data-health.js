// 数据体检（L6-3）：给每个数据键算出「最后修改时间」和「占用估算」。
//
// 纯函数，只读数据、不写任何东西，供数据页的「数据概览」面板展示。

// 递归收集对象里出现过的所有时间戳字段值（ISO 字符串或可被 Date 解析的值）。
// 认常见的更新时间字段名；认不出的字段不碰，宁可少算也不误判。
const TS_KEYS = new Set(['updatedAt', 'createdAt', 'lastRecordedAt', 'uploadedAt', 'completedAt', 'restoredAt', 'lastExportedAt', 'exportedAt']);

function collectTimestamps(value, into) {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') return;
  if (Array.isArray(value)) {
    for (const item of value) collectTimestamps(item, into);
    return;
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (TS_KEYS.has(key) && child != null && typeof child === 'string') {
        const time = Date.parse(child);
        if (!Number.isNaN(time)) into.push(time);
      } else {
        collectTimestamps(child, into);
      }
    }
  }
}

/** 数据里最晚的时间戳（毫秒），没有可识别时间戳时返回 null。 */
export function lastModifiedAt(value) {
  const times = [];
  collectTimestamps(value, times);
  if (!times.length) return null;
  return Math.max(...times);
}

/** 占用估算：把值序列化成 JSON 后的字符数（近似字节数，UTF-16 每字符 2 字节）。 */
export function estimateBytes(value) {
  if (value === null || value === undefined) return 0;
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 0;
  }
}

const UNITS = ['B', 'KB', 'MB', 'GB'];

/** 把字节数格式化成易读文本。 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
}

/** 给一组数据键算体检结果，返回 { key: { lastModifiedAt, bytes } }。 */
export function healthFor(entries) {
  const result = {};
  for (const [key, value] of entries) {
    result[key] = { lastModifiedAt: lastModifiedAt(value), bytes: estimateBytes(value) };
  }
  return result;
}
