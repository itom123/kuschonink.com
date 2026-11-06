// Menu items for the Start menu (and the shared menu renderer).
// "&" marks the access key, as in Windows: "&Programs" → Programs with P underlined.

export interface MenuItem {
  label?: string;
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
