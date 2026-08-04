export type DateInput = Date | string | number | null | undefined;

const pad = (value: number) => String(value).padStart(2, '0');

const parseDateInput = (value: DateInput): Date | null => {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (dateOnly && !value.includes('T')) {
      const [, year, month, day] = dateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateDDMMYYYY = (value: DateInput, fallback = '—') => {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
};

export const formatDateTimeDDMMYYYY = (value: DateInput, fallback = '—') => {
  const date = parseDateInput(value);
  if (!date) return fallback;
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${formatDateDDMMYYYY(date, fallback)}, ${time}`;
};

const DATE_FORMAT_PATCH_FLAG = Symbol.for('farm-connect.dd-mm-yyyy-installed');

const MONTH_NUMBER: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const normalizeDateText = (text: string) => text
  .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3-$2-$1')
  .replace(/\b(\d{1,2})[\/]([01]?\d)[\/](\d{4})\b/g, (_, day, month, year) => (
    `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`
  ))
  .replace(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*[\s,]+(\d{4})\b/gi, (_, day, month, year) => (
    `${String(day).padStart(2, '0')}-${MONTH_NUMBER[String(month).slice(0, 3).toLowerCase()]}-${year}`
  ));

const normalizeRenderedDates = (root: Node) => {
  if (typeof document === 'undefined') return;
  if (root.nodeType === Node.TEXT_NODE) {
    const node = root as Text;
    const parent = node.parentElement;
    if (parent && !parent.closest('script, style, textarea, code, pre, [data-keep-date-format="true"]')) {
      const normalized = normalizeDateText(node.data);
      if (normalized !== node.data) node.data = normalized;
    }
    return;
  }
  const acceptNode = (node: Node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest('script, style, textarea, code, pre, [data-keep-date-format="true"]')) {
      return NodeFilter.FILTER_REJECT;
    }
    return NodeFilter.FILTER_ACCEPT;
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode });
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  textNodes.forEach((node) => {
    const normalized = normalizeDateText(node.data);
    if (normalized !== node.data) node.data = normalized;
  });
};

export const installProjectDateFormatting = () => {
  const globalState = globalThis as typeof globalThis & { [DATE_FORMAT_PATCH_FLAG]?: boolean };
  if (globalState[DATE_FORMAT_PATCH_FLAG]) return;
  globalState[DATE_FORMAT_PATCH_FLAG] = true;

  const originalDateString = Date.prototype.toLocaleDateString;
  const originalDateTimeString = Date.prototype.toLocaleString;

  Date.prototype.toLocaleDateString = function (locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    const localeList = Array.isArray(locales) ? locales : [locales];
    const isIsoLocale = localeList.some((locale) => String(locale || '').toLowerCase() === 'en-ca');
    if (isIsoLocale) return originalDateString.call(this, locales, options);
    const isFullDate = !options || Boolean(options.dateStyle) || Boolean(options.day && options.month && options.year);
    return isFullDate ? formatDateDDMMYYYY(this) : originalDateString.call(this, locales, options);
  };

  Date.prototype.toLocaleString = function (locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
    const isFullDateTime = !options || Boolean(options.dateStyle) || Boolean(options.day && options.month && options.year);
    return isFullDateTime ? formatDateTimeDDMMYYYY(this) : originalDateTimeString.call(this, locales, options);
  };

  if (typeof document !== 'undefined') {
    const startObserver = () => {
      normalizeRenderedDates(document.body);
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'characterData') normalizeRenderedDates(mutation.target);
          mutation.addedNodes.forEach(normalizeRenderedDates);
        });
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    };
    if (document.body) startObserver();
    else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  }
};
