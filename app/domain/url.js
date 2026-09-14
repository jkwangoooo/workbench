export function validateHttpUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { error: '请填写网址' };

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: '网址格式不正确，请填写完整的 http 或 https 地址' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { error: '网址必须以 http:// 或 https:// 开头' };
  if (!parsed.hostname) return { error: '网址缺少主机名' };

  return { url: raw };
}
