import { class7Name, class8Name } from './constants.js';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
export function attr(value) {
  return esc(value);
}

export function classLabel(number) {
  return number === '7' ? class7Name : class8Name;
}

export function toast(message) {
  const old = document.querySelector('.local-toast');
  if (old) old.remove();
  const node = document.createElement('div');
  node.className = 'local-toast';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 2600);
}
export function panel(title, body, extra) {
  return `<section class="local-panel pad ${extra || ''}"><div class="local-panel-title"><h3>${esc(title)}</h3></div>${body}</section>`;
}
export function empty(text) {
  return `<div class="local-empty">${esc(text)}</div>`;
}
export function button(label, action, extra) {
  return `<button type="button" class="local-button ${extra || ''}" data-action="${attr(action)}">${esc(label)}</button>`;
}
export function inputField(label, name, value, type = 'text', extra = '') {
  return `<div class="local-field"><label>${esc(label)}</label><input class="local-input" name="${attr(name)}" type="${type}" value="${attr(value)}" ${extra}></div>`;
}
export function selectField(label, name, options, selected) {
  return `<div class="local-field"><label>${esc(label)}</label><select class="local-select" name="${attr(name)}">${options.map(([value, label]) => `<option value="${attr(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`).join('')}</select></div>`;
}

export function head(title, description, actions = '') {
  return `<div class="local-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="local-actions">${actions}</div></div>`;
}
