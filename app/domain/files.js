// 工作文件领域逻辑（需求 §4 / L5-2）
//
// 纯函数：文件类型/大小校验、同名检测、分类规范化，便于单元测试。
// 文件元数据存 LOCAL_KEYS.resources.files，二进制 Blob 存 IndexedDB（同 id 关联）。

/** 单文件大小上限（50MB）。 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/** 允许的常见办公文件扩展名（小写，含点）。 */
export const ALLOWED_EXTENSIONS = [
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.txt'
];

/** 可网页预览的类型（PDF / 图片 / TXT）。 */
export const PREVIEWABLE = {
  'application/pdf': true,
  'image/png': true,
  'image/jpeg': true,
  'image/gif': true,
  'image/webp': true,
  'image/bmp': true,
  'text/plain': true
};

/** 校验单个文件：返回 { ok } 或 { ok:false, error }。 */
export function validateFile(file) {
  if (!file || typeof file !== 'object') {
    return { ok: false, error: '不是有效的文件' };
  }
  const name = String(file.name || '');
  if (!name) return { ok: false, error: '文件缺少名称' };

  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot).toLowerCase() : '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, error: `不支持的文件类型 ${ext || '（无扩展名）'}，仅支持常见办公文件、图片和 TXT` };
  }
  const size = Number(file.size) || 0;
  if (size <= 0) return { ok: false, error: '文件大小为 0，无法上传' };
  if (size > MAX_FILE_SIZE) {
    return { ok: false, error: `文件超过 50MB 上限（${formatSize(size)}），上传前被拒绝` };
  }
  return { ok: true, name, size, mime: file.type || guessMime(ext), ext };
}

/** 分类规范化：去首尾空格。 */
export function normalizeCategory(raw) {
  return String(raw ?? '').trim();
}

/** 文件名规范化：用于同名判断（去首尾空格，大小写不敏感折叠）。 */
export function normalizedName(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}

/** 同名检测：同一分类下是否已存在同名文件（用 normalizedName 比较）。 */
export function findDuplicate(files, category, name) {
  const cat = normalizeCategory(category);
  const norm = normalizedName(name);
  return files.find((f) => normalizeCategory(f.category) === cat && normalizedName(f.originalName) === norm) || null;
}

/** 文件列表筛选：文件名包含匹配（忽略大小写与首尾空白）+ 分类精确匹配；两个条件都为空就返回全部。 */
export function filterFiles(files, search, category) {
  const needle = normalizedName(search);
  const cat = normalizeCategory(category);
  return files.filter((file) => {
    if (needle && !normalizedName(file.originalName).includes(needle)) return false;
    if (cat && normalizeCategory(file.category) !== cat) return false;
    return true;
  });
}

/** 从扩展名猜 MIME（File 对象通常自带 type，Blob 可能没有）。 */
export function guessMime(ext) {
  const table = {
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.txt': 'text/plain'
  };
  return table[ext] || 'application/octet-stream';
}

/** 是否可网页预览。 */
export function isPreviewable(mime) {
  return PREVIEWABLE[mime] === true;
}

/** 格式化文件大小为可读文本。 */
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
