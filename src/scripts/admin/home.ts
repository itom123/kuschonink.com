// /admin: the hidden log-on, and once logged on, the folder of admin
// programs. Page content in a window: idempotent, keeps to its window, and
// asks the desktop through window.kus98 when it is there (docs/DESKTOP.md).
import { AW } from '../../lib/admin-words';
import { adminOff, adminOn, api, forget, whoAmI } from './api';

type Bi = { en: string; zh: string };
const pick = (b: Bi) => (document.documentElement.dataset.lang === 'zh' && b.zh ? b.zh : b.en);
const kus = () => (window as unknown as { kus98?: { alert(o: object): Promise<string>; play(n: string): void; open(u: string, o?: object): Promise<void> } }).kus98;

// The admin cookies need the visitor's leave for cookies (consent.ts), as a
// guide's log-on does: the Information Bar asks if need be, with its general
// wording, so the public Cookies dialog never names admin mode. Without the
// desktop it goes ahead: posting the form is asking for the cookie.
let asking = false;
async function cookiesAllowed(): Promise<boolean> {
  const c = (window as unknown as { kus98?: { consent?: { ask(feature: string): Promise<boolean> } } }).kus98?.consent;
  if (!c) return true;
  if (asking) return false; // OK pressed again while the bar waits for an answer
  asking = true;
  try {
    return await c.ask('admin');
  } finally {
    asking = false;
  }
}

/** Both languages, as the 中/EN switch expects (two data-l spans). */
export function setText(el: Element, b: Bi) {
  const en = document.createElement('span');
  en.dataset.l = 'en';
  en.textContent = b.en;
  const zh = document.createElement('span');
  zh.dataset.l = 'zh';
  zh.lang = 'zh-Hans';
  zh.textContent = b.zh || b.en;
  el.replaceChildren(en, zh);
}

export function initAdminHome() {
  for (const root of document.querySelectorAll<HTMLElement>('[data-adm]:not([data-ready])')) {
    root.dataset.ready = '1';
    const form = root.querySelector<HTMLFormElement>('[data-adm-form]')!;
    const pass = form.querySelector<HTMLInputElement>('input[name="password"]')!;
    const code = form.querySelector<HTMLInputElement>('input[name="code"]')!;
    const ok = form.querySelector<HTMLButtonElement>('[data-adm-ok]')!;
    const msg = root.querySelector<HTMLElement>('[data-adm-msg]')!;
    const status = root.querySelector<HTMLElement>('[data-adm-status]')!;
    const say = (b: Bi | null) => {
      msg.hidden = !b;
      if (b) setText(msg, b);
    };

    const show = async (fresh = false) => {
      const me = await whoAmI(fresh);
      root.dataset.admState = me.admin ? 'admin' : 'logon';
      if (!me.admin) {
        adminOff();
        requestAnimationFrame(() => pass.focus());
        return;
      }
      adminOn();
      const missing = [
        !me.notion && 'Notion (NOTION_TOKEN)',
        !me.mail && 'email (MAIL_OUT)',
        !me.routine && 'the routine (ROUTINE_FIRE_URL, ROUTINE_TOKEN)',
        !me.github && 'publishing (GITHUB_TOKEN)',
      ].filter(Boolean) as string[];
      const until = me.exp ? new Date(me.exp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
      setText(status, {
        en: `${AW.loggedOn.en}${until ? `, ${AW.until(until).en}` : ''}.${missing.length ? ` ${AW.notSetUp(missing.join(', ')).en}` : ''}`,
        zh: `${AW.loggedOn.zh}${until ? `，${AW.until(until).zh}` : ''}。${missing.length ? AW.notSetUp(missing.join('、')).zh : ''}`,
      });
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (ok.disabled) return;
      const c = code.value.replace(/\s/g, '');
      if (!pass.value || !/^\d{6}$/.test(c)) {
        say(AW.wrong);
        (pass.value ? code : pass).focus();
        return;
      }
      if (!(await cookiesAllowed())) return;
      ok.disabled = true;
      say(AW.checking);
      const r = await api('/login', { password: pass.value, code: c });
      ok.disabled = false;
      if (r.ok) {
        pass.value = '';
        code.value = '';
        say(null);
        forget();
        kus()?.play('ding');
        await show(true);
        return;
      }
      code.value = '';
      kus()?.play('chord');
      const err = r.data.error ?? '';
      say(err === 'wait' ? AW.wait : err === 'not_configured' ? AW.off : err === 'wrong' ? AW.wrong : AW.failed);
      if (err === 'wrong') pass.select();
      pass.focus();
    });

    root.addEventListener('click', async (e) => {
      const btn = (e.target as Element).closest<HTMLElement>('[data-adm-cmd]');
      if (!btn) return;
      const cmd = btn.dataset.admCmd;
      if (cmd === 'logoff-all') {
        const k = kus();
        const sure = k ? await k.alert({ title: AW.logOffAll, text: { en: 'End admin mode in every browser where you are logged on?', zh: '在所有已登录的浏览器里结束管理模式吗？' }, icon: 'question', buttons: ['Yes', 'No'] }) : (window.confirm(pick(AW.logOffAll)) ? 'Yes' : 'No');
        if (sure !== 'Yes') return;
      }
      await api(cmd === 'logoff-all' ? '/logout-all' : '/logout', {});
      forget();
      adminOff();
      await show(true);
    });

    void show();
  }
}
