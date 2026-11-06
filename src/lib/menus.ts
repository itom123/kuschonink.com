// Menu items for the Start menu (and the shared menu renderer).
// "&" marks the access key, as in Windows: "&Programs" → Programs with P underlined.

export interface MenuItem {
  label?: string;
  /** The Chinese label (the 中/EN switch), with its own & access key: "程序(&P)". */
  zh?: string;
  href?: string;
  /** A shell command instead of a link (needs JavaScript). */
  cmd?: string;
  icon?: string;
  sub?: MenuItem[];
  sep?: true;
  /** Large (32 px) row, as in the first level of the Start menu. */
  big?: boolean;
  external?: boolean;
  jsOnly?: boolean;
  disabled?: boolean;
  /** Shortcut text shown on the right, e.g. "Alt+F4". */
  key?: string;
  /** Extra attributes, e.g. { 'data-recent': '' }. */
  attrs?: Record<string, string>;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** "&Programs" → "<u>P</u>rograms" (escaped). "&&" is a literal ampersand. */
export function accelHtml(label: string): string {
  let out = '';
  for (let i = 0; i < label.length; i++) {
    const ch = label[i];
    if (ch === '&' && label[i + 1] === '&') { out += '&amp;'; i++; continue; }
    if (ch === '&' && i + 1 < label.length) { out += `<u>${escapeHtml(label[i + 1])}</u>`; i++; continue; }
    out += escapeHtml(ch);
  }
  return out;
}

/** The access key letter of a label, lower-case ("" if none). */
export function accelKey(label = ''): string {
  const m = /&([^&])/.exec(label.replace(/&&/g, ''));
  return m ? m[1].toLowerCase() : '';
}

export const plainLabel = (label = '') => label.replace(/&&/g, '\u0000').replace(/&/g, '').replace(/\u0000/g, '&');

/** A label in both languages for the 中/EN switch (English only when there's no Chinese). */
export function biAccelHtml(label: string, zh?: string): string {
  if (!zh) return accelHtml(label);
  return `<span data-l="en">${accelHtml(label)}</span><span data-l="zh" lang="zh-Hans">${accelHtml(zh)}</span>`;
}

/** Menu bar names in Chinese, as in the Chinese edition of Windows 98. */
export const MENU_ZH: Record<string, string> = {
  '&File': '文件(&F)',
  '&Edit': '编辑(&E)',
  '&View': '查看(&V)',
  '&Go': '转到(&G)',
  'F&avorites': '收藏(&A)',
  '&Help': '帮助(&H)',
  '&Options': '选项(&O)',
  '&Tools': '工具(&T)',
  'F&ormat': '格式(&O)',
  '&Insert': '插入(&I)',
  '&Image': '图像(&I)',
  '&Colors': '颜色(&C)',
};
