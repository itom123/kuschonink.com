// Starting up, logging on and off, shutting down, restarting, standing by.
// Loaded only when needed (the first page of a session, or from the Start menu).
import { consent } from './consent';
import { msgbox, openDialog } from './dialogs';
import { navigate } from './router';
import { session } from './session';
import { settings } from './settings';
import { play, unlockAudio } from './sound';
import { tipFor } from './tooltips';
import { coarseQuery, emit, h, html, reducedMotion, tr, type Text } from './util';
import { W } from './words';
import * as wm from './wm';

const box = () => document.getElementById('k98-boot')!;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const BIOS = [
  'Main Processor   : 333 MHz',
  'Memory Testing   : 65536K OK',
  '',
  'Detecting IDE Primary Master   ... XIANGYIN ARCHIVE',
  'Detecting IDE Primary Slave    ... THE HOUSE, 37 ROOMS',
  'Detecting IDE Secondary Master ... CD-ROM',
  '',
  'Starting Xiangyin 98...',
];

/** Everything behind the start-up screens is out of reach meanwhile. */
function shield(on: boolean) {
  for (const id of ['k98-desktop', 'k98-windows', 'k98-taskbar']) document.getElementById(id)?.toggleAttribute('inert', on);
}

function anyKeyOrClick(): Promise<void> {
  return new Promise((resolve) => {
    const go = (e: Event) => {
      if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) return;
      e.preventDefault();
      removeEventListener('keydown', go, true);
      removeEventListener('pointerdown', go, true);
      resolve();
    };
    addEventListener('keydown', go, true);
    addEventListener('pointerdown', go, true);
  });
}

/** BIOS text, the sky splash, then the log-on box. Any key or click skips ahead. */
export async function startUp() {
  html.dataset.boot = 'boot';
  shield(true);
  const b = box();
  const pre = b.querySelector<HTMLElement>('.bios-text')!;
  const msg = b.querySelector<HTMLElement>('[data-splash-msg]')!;
  msg.textContent = '';
  let skipped = false;
  const skip = anyKeyOrClick().then(() => (skipped = true));
  const wait = (ms: number) => Promise.race([sleep(ms), skip]);
  const reduce = reducedMotion.matches;
  b.dataset.step = 'bios';
  pre.textContent = '';
  if (!reduce) {
    for (const line of BIOS) {
      if (skipped) break;
      pre.textContent += `${line}\n`;
      await wait(95);
    }
    if (!skipped) await wait(300);
  }
  b.dataset.step = 'splash';
  await wait(reduce || skipped ? 450 : 1900);
  await logOn();
}

/** The log-on box. OK or Cancel both log on, as Guest (everyone is), as in Windows 98. */
export function logOn(): Promise<string> {
  html.dataset.boot = 'login';
  shield(true);
  const b = box();
  const form = b.querySelector<HTMLFormElement>('[data-login-form]')!;
  const name = b.querySelector<HTMLInputElement>('#login-name')!;
  const pass = b.querySelector<HTMLInputElement>('#login-pass')!;
  // Everyone is Guest: the name can't be changed (admin has its own log-on, /admin).
  name.value = session.lastUser();
  name.readOnly = true;
  pass.value = '';
  // The password box only ever shows stars and keeps nothing.
  pass.oninput = () => (pass.value = '*'.repeat(pass.value.length));
  requestAnimationFrame(() => {
    if (coarseQuery.matches) form.querySelector<HTMLButtonElement>('button[type="submit"]')!.focus();
    else {
      name.focus();
      name.select();
    }
  });
  return new Promise((resolve) => {
    // Every way out logs on as Guest: nothing typed counts (session.ts).
    const done = () => {
      form.onsubmit = null;
      removeEventListener('keydown', esc, true);
      resolve(finish());
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        done();
      }
    };
    addEventListener('keydown', esc, true);
    form.onsubmit = (e) => {
      e.preventDefault();
      done();
    };
    b.querySelectorAll<HTMLElement>('[data-login="cancel"]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        done();
      };
    });
    const help = b.querySelector<HTMLElement>('[data-login-help]');
    if (help) help.onclick = () => tipFor(help, tr({ en: 'There is no account and no password: everyone logs on as Guest. Press OK.', zh: '没有帐户，也没有密码：每个人都以 Guest 身份登录。请按“确定”。' }), 6000);
  });
}

function finish() {
  unlockAudio();
  const n = session.logOn();
  delete html.dataset.boot;
  box().dataset.step = 'bios';
  shield(false);
  play('startup');
  emit(document, 'desktop:login', { user: n });
  // The home page follows "Show this screen each time Xiangyin 98 starts".
  const welcome = wm.find('welcome');
  if (welcome && !settings.get().showWelcome) wm.close(welcome);
  showBeginHint();
  wm.getActive()?.el.querySelector<HTMLElement>('[data-window-body]')?.focus({ preventScroll: true });
  return n;
}

/** "Click here to begin", pointing at Start, until Start is first opened. */
export function showBeginHint() {
  try {
    if (sessionStorage.getItem('kus98:begun')) return;
  } catch { /* ignore */ }
  if (document.querySelector('.begin-hint')) return;
  const hint = h('button', { type: 'button', class: 'begin-hint' }, [h('span', { class: 'begin-text' }, tr({ en: 'Click here to begin', zh: '单击这里开始' }))]);
  document.body.appendChild(hint);
  const done = () => {
    hint.remove();
    if (consent.allows('tab')) {
      try { sessionStorage.setItem('kus98:begun', '1'); } catch { /* ignore */ }
    }
    document.removeEventListener('start:open', done);
  };
  hint.addEventListener('click', () => {
    done();
    document.querySelector<HTMLElement>('#k98-start > summary')?.click();
  });
  document.addEventListener('start:open', done);
  setTimeout(() => hint.isConnected && hint.remove(), 25000);
}

function closeAll() {
  for (let guard = 0; guard < 60 && wm.list().length; guard++) {
    const w = wm.list().find((x) => !x.modal) ?? wm.list()[0];
    wm.close(w);
  }
}

export async function logOff() {
  const r = await msgbox({
    title: { en: 'Log Off Xiangyin 98', zh: '注销 Xiangyin 98' },
    icon: 'question',
    text: { en: 'Are you sure you want to log off?', zh: '确实要注销吗？' },
    buttons: ['Yes', 'No'],
    sound: false,
  });
  if (r !== 'Yes') return;
  // Administrator logs off from admin mode too (the server ends the session).
  if (html.hasAttribute('data-admin')) {
    await fetch('/v1/admin/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', credentials: 'same-origin' }).catch(() => {});
    document.cookie = 'kus98_admin_ui=; path=/; max-age=0; SameSite=Lax';
    html.removeAttribute('data-admin');
  }
  play('logoff');
  closeAll();
  session.logOff();
  try { history.replaceState({ kus98: 1 }, '', '/'); } catch { /* ignore */ }
  await logOn();
  if (settings.get().showWelcome) navigate('/', { source: 'script' });
}

function standBy() {
  html.dataset.boot = 'standby';
  const wake = () => {
    delete html.dataset.boot;
    removeEventListener('pointermove', wake, true);
    removeEventListener('pointerdown', wake, true);
    removeEventListener('keydown', wake, true);
  };
  setTimeout(() => {
    addEventListener('pointermove', wake, true);
    addEventListener('pointerdown', wake, true);
    addEventListener('keydown', wake, true);
  }, 700);
}

async function goDown(how: 'shutdown' | 'restart') {
  play('shutdown');
  const b = box();
  html.dataset.boot = 'shutting';
  b.dataset.step = 'splash';
  shield(true);
  b.querySelector<HTMLElement>('[data-splash-msg]')!.textContent =
    how === 'restart'
      ? tr({ en: 'Xiangyin 98 is restarting…', zh: 'Xiangyin 98 正在重新启动……' })
      : tr({ en: 'Please wait while your computer shuts down.', zh: '请稍候，计算机正在关闭。' });
  await sleep(reducedMotion.matches ? 600 : 2600);
  session.logOff();
  if (how === 'restart') {
    location.assign('/');
    return;
  }
  html.dataset.boot = 'safe';
  await anyKeyOrClick();
  location.assign('/');
}

/** Start ▸ Shut Down: the screen dims and asks what to do. */
export function shutDownDialog() {
  if (document.querySelector('.shutdown-box')) return;
  // The whole screen dims (taskbar too); the dialog stays bright above it.
  const layer = document.getElementById('k98-windows')!;
  const dim = h('div', { class: 'shutdown-dim', 'aria-hidden': 'true' });
  layer.classList.add('over-taskbar');
  layer.appendChild(dim);
  const choices: [string, Text][] = [
    ['standby', { en: 'Stand by', zh: '待机' }],
    ['shutdown', { en: 'Shut down', zh: '关闭计算机' }],
    ['restart', { en: 'Restart', zh: '重新启动' }],
  ];
  const ok = h('button', { type: 'button', class: 'default', 'data-btn': 'OK' }, W.ok);
  const cancel = h('button', { type: 'button', 'data-btn': 'Cancel' }, W.cancel);
  const help = h('button', { type: 'button', 'data-btn': 'Help' }, W.help);
  const body = h('div', { class: 'msgbox shutdown-box' }, [
    h('div', { class: 'msg-row' }, [
      h('span', { class: 'ico ico-shutdown', 'aria-hidden': 'true' }),
      h('div', { class: 'shutdown-choices' }, [
        h('p', { class: 'msg-text' }, { en: 'What do you want the computer to do?', zh: '你希望计算机做什么？' }),
        ...choices.map(([v, l]) =>
          h('div', { class: 'field-row' }, [
            h('input', { type: 'radio', name: 'k98-shutdown', id: `k98-sd-${v}`, value: v, checked: v === 'shutdown' ? '' : undefined }),
            h('label', { for: `k98-sd-${v}` }, l),
          ]),
        ),
      ]),
    ]),
    h('div', { class: 'msg-buttons' }, [ok, cancel, help]),
  ]);
  const win = openDialog({
    title: { en: 'Shut Down Xiangyin 98', zh: '关闭 Xiangyin 98' },
    icon: 'shutdown',
    body,
    modal: true,
    onClose: () => {
      dim.remove();
      layer.classList.remove('over-taskbar');
    },
  });
  win.el.style.zIndex = '900000';
  ok.addEventListener('click', () => {
    const v = body.querySelector<HTMLInputElement>('input:checked')?.value ?? 'shutdown';
    wm.close(win);
    if (v === 'standby') standBy();
    else goDown(v as 'shutdown' | 'restart');
  });
  cancel.addEventListener('click', () => wm.close(win));
  help.addEventListener('click', () => {
    wm.close(win);
    navigate('/help#startup');
  });
  body.querySelector<HTMLInputElement>('input:checked')?.focus();
}
