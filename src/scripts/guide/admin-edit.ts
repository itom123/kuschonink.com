// Field Guide (导览) in admin mode: an Edit… button on each entry's details,
// which opens a Properties dialog and saves the entry straight to the guide
// (POST /v1/admin/items/<slug>/<id>: a commit to main, after the guide's own
// check). Loaded only when html[data-admin] is set; the server checks the
// admin session on every call, so this file grants nothing by itself.
import { AW } from '../../lib/admin-words';
import { api } from '../admin/api';
import { desktop, dialog, h, message, type Bi } from './dom';

interface Field { k: string; label: Bi; area?: boolean; select?: string[] }
const FIELDS: Field[] = [
  { k: 'tier', label: { en: 'Tier', zh: '级别' }, select: ['A', 'B', 'C'] },
  { k: 'name', label: { en: 'Name', zh: '名称' } },
  { k: 'short', label: { en: 'Map label', zh: '地图标签' } },
  { k: 'subtitle', label: { en: 'Subtitle', zh: '副标题' } },
  { k: 'by', label: { en: 'By', zh: '作者' } },
  { k: 'why', label: { en: 'Why', zh: '推荐理由' }, area: true },
  { k: 'whyZh', label: { en: 'Why (Chinese)', zh: '推荐理由（中文）' }, area: true },
  { k: 'address', label: { en: 'Address', zh: '地址' } },
  { k: 'hours', label: { en: 'Hours', zh: '开放时间' } },
  { k: 'hoursZh', label: { en: 'Hours (Chinese)', zh: '开放时间（中文）' } },
  { k: 'start', label: { en: 'First day', zh: '第一天' } },
  { k: 'end', label: { en: 'Last day', zh: '最后一天' } },
  { k: 'price', label: { en: 'Price', zh: '价格' } },
  { k: 'priceZh', label: { en: 'Price (Chinese)', zh: '价格（中文）' } },
  { k: 'note', label: { en: 'Note', zh: '提醒' }, area: true },
  { k: 'noteZh', label: { en: 'Note (Chinese)', zh: '提醒（中文）' }, area: true },
  { k: 'sourceUrl', label: { en: 'Source page', zh: '信息来源页' } },
];

async function editEntry(root: HTMLElement, id: string) {
  const slug = root.dataset.slug ?? '';
  const owner = root.closest<HTMLElement>('[data-window]') ?? root;
  const got = await api<{ item: Record<string, unknown> }>(`/items/${slug}/${id}`);
  if (!got.ok) {
    await message({ title: AW.editEntryTitle, text: got.status === 503 ? AW.notSetUp('publishing (GITHUB_TOKEN)') : AW.failed2(got.data.error ?? String(got.status)), icon: 'warning', owner });
    return;
  }
  const item = got.data.item;
  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();
  const uid = Math.random().toString(36).slice(2, 8);
  const rows = FIELDS.map((f) => {
    const fid = `gae-${uid}-${f.k}`;
    const v = typeof item[f.k] === 'string' ? (item[f.k] as string) : '';
    const input = f.select ? h('select', { id: fid }, f.select.map((o) => h('option', { value: o }, o))) : f.area ? h('textarea', { id: fid, rows: 3 }) : h('input', { id: fid, type: 'text' });
    input.value = v;
    inputs.set(f.k, input);
    return h('div', { class: 'adm-row' }, [h('label', { for: fid }, f.label), input]);
  });
  const ok = h('button', { type: 'submit', class: 'default' }, AW.save);
  const cancel = h('button', { type: 'button' }, AW.cancel);
  const say = h('p', { class: 'adm-lead', role: 'status' }, AW.editEntryLead);
  const form = h('form', { class: 'adm-form' }, [say, ...rows, h('div', { class: 'adm-buttons' }, [ok, cancel])]);
  const d = dialog({ title: { en: `${AW.editEntryTitle.en}: ${id}`, zh: `${AW.editEntryTitle.zh}：${id}` }, body: form, owner, icon: 'keys', className: 'adm-dialog' });
  cancel.addEventListener('click', () => d.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fields: Record<string, string | null> = {};
    for (const [k, input] of inputs) {
      const before = typeof item[k] === 'string' ? (item[k] as string) : '';
      const now = input.value.trim();
      if (now !== before) fields[k] = now || null;
    }
    if (!Object.keys(fields).length) return d.close();
    ok.disabled = true;
    say.replaceChildren(h('span', {}, AW.loading));
    const r = await api<{ id?: string; commit?: string; problems?: string[] }>(`/items/${slug}/${id}`, { fields });
    ok.disabled = false;
    if (!r.ok) {
      const problems = r.data.problems?.join('\n');
      say.replaceChildren(h('span', {}, problems ? { en: problems, zh: problems } : AW.failed2(r.data.error ?? String(r.status))));
      desktop()?.play('chord');
      return;
    }
    desktop()?.play('ding');
    d.close();
    await message({ title: AW.editEntryTitle, text: { en: `Saved${r.data.id && r.data.id !== id ? ` as ${r.data.id}` : ''}. The guide updates in about a minute.`, zh: `已保存${r.data.id && r.data.id !== id ? `，新编号 ${r.data.id}` : ''}。大约一分钟后导览更新。` }, icon: 'info', owner });
  });
  rows[1]?.querySelector<HTMLElement>('input, textarea, select')?.focus();
}

/** Edit… on each entry, in admin mode. */
export function initGuideAdmin() {
  if (!document.documentElement.hasAttribute('data-admin')) return;
  for (const root of document.querySelectorAll<HTMLElement>('[data-gd]:not([data-admin-ready])')) {
    root.dataset.adminReady = '1';
    for (const art of root.querySelectorAll<HTMLElement>('[data-gd-article][data-kind="item"]')) {
      const actions = art.querySelector('.gd-actions');
      if (!actions || actions.querySelector('[data-gd-admin-edit]')) continue;
      const b = h('button', { type: 'button', 'data-gd-admin-edit': true, 'data-admin-only': true }, { en: 'Edit…', zh: '编辑…' });
      b.addEventListener('click', () => void editEntry(root, art.dataset.gdArticle!));
      actions.append(b);
    }
  }
}
