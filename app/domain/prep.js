// 备课中心入口配置（需求 §6）
//
// 工作台只负责展示入口和执行跳转，不复制、读取或修改备课网页业务数据。
// 配置只允许绝对 https:// 地址；空值/非法协议/相对路径一律视为「尚未配置」。

/** 校验备课中心地址：只接受绝对 https:// URL。返回 { url } 或 { error }。 */
export function prepWorkflowUrl(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { url: null, configured: false };

  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    return { url: null, configured: false, error: '地址不是合法的 URL' };
  }

  if (parsed.protocol !== 'https:') {
    return { url: null, configured: false, error: '备课中心地址必须使用 https:// 协议' };
  }
  if (!parsed.hostname) {
    return { url: null, configured: false, error: '地址缺少主机名' };
  }

  // 不携带查询参数、token、学生数据等——只保留协议+主机+路径。
  return { url: parsed.origin + (parsed.pathname || '/'), configured: true };
}

/** 判断是否已配置有效地址。 */
export function isPrepConfigured(raw) {
  return prepWorkflowUrl(raw).configured;
}
