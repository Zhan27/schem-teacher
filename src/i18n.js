import english from './locales/en.json' with { type: 'json' };
let locale = 'zh';
try {
  const requested = new URL(location.href).searchParams.get('lang');
  const saved = localStorage.getItem('schem-teacher:language');
  locale = ['zh', 'en'].includes(requested) ? requested : saved === 'en' ? 'en' : 'zh';
} catch {}
export const getLocale = () => locale;
export function setLocale(value, persist = true) {
  if (!['zh', 'en'].includes(value)) return;
  locale = value;
  if (persist)
    try {
      localStorage.setItem('schem-teacher:language', value);
    } catch {}
  if (typeof document !== 'undefined') document.documentElement.lang = value === 'en' ? 'en' : 'zh-CN';
}
export function t(key, values = {}) {
  const message = locale === 'en' ? english[key] || key : key;
  return message.replace(/\{(\w+)\}/g, (all, name) => values[name] ?? all);
}
export function message(text) {
  if (locale === 'zh' || typeof text !== 'string') return text;
  if (Object.hasOwn(english, text)) return english[text];
  const patterns = [
    [/^不支持的 NBT 标签 (.*)$/, '不支持的 NBT 标签 {tag}', 'tag'],
    [
      /^首版支持 Sponge \.schem v3；当前版本为 (.*)。请先在可信编辑器中转换格式。$/,
      '格式不支持，当前版本 {version}',
      'version',
    ],
    [/^加载失败：(.*)$/, '加载失败：{error}', 'error'],
  ];
  for (const [pattern, key, name] of patterns) {
    const match = text.match(pattern);
    if (match) return t(key, { [name]: message(match[1]) });
  }
  return text;
}
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  for (const name of ['aria-label', 'title', 'placeholder', 'content'])
    root
      .querySelectorAll('[data-i18n-' + name + ']')
      .forEach((el) => el.setAttribute(name, t(el.getAttribute('data-i18n-' + name))));
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
}
export const unit = (n, kind = 'blocks') =>
  locale === 'zh'
    ? n + ({ blocks: '格', layers: '层', groups: '组' }[kind] || kind)
    : n + ' ' + (n === 1 ? { blocks: 'block', layers: 'layer', groups: 'group' }[kind] || kind : kind);
