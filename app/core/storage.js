export function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}
export function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
export function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
