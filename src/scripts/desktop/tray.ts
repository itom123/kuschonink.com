// The speaker in the tray: click for the volume slider and Mute,
// double-click for Sounds Properties.
import { commands } from './commands';
import { settings } from './settings';
import { play, unlockAudio } from './sound';
import { h, tr } from './util';

let pop: HTMLElement | null = null;
const VOLUME = { en: 'Volume', zh: '音量' };

function closePop() {
  pop?.remove();
  pop = null;
  removeEventListener('pointerdown', outside, true);
}

function outside(e: PointerEvent) {
  const t = e.target as Node;
  if (pop?.contains(t) || document.getElementById('k98-volume')?.contains(t)) return;
  closePop();
}

function openPop() {
  const s = settings.get();
  const range = h('input', { type: 'range', class: 'has-box-indicator', min: '0', max: '100', step: '5', value: String(Math.round(s.volume * 100)), 'aria-label': VOLUME });
  const mute = h('input', { type: 'checkbox', id: 'k98-mute', checked: s.sound ? undefined : '' });
  range.addEventListener('input', () => settings.set({ volume: Number(range.value) / 100 }));
  range.addEventListener('change', () => play('ding'));
  mute.addEventListener('change', () => {
    unlockAudio();
    settings.set({ sound: !mute.checked });
    if (!mute.checked) play('ding');
  });
  pop = h('div', { class: 'window volume-popup', role: 'dialog', 'aria-label': VOLUME }, [
    h('p', {}, VOLUME),
    h('div', { class: 'volume-track' }, [h('div', { class: 'is-vertical' }, [range])]),
    h('div', { class: 'field-row' }, [mute, h('label', { for: 'k98-mute' }, { en: 'Mute', zh: '静音' })]),
  ]);
  document.body.appendChild(pop);
  range.focus();
  addEventListener('pointerdown', outside, true);
}

export function initTray() {
  const btn = document.getElementById('k98-volume');
  if (!btn) return;
  const ico = btn.querySelector('.ico')!;
  const sync = () => {
    const s = settings.get();
    const on = s.sound && s.volume > 0;
    ico.className = `ico ico16 ico-${on ? 'speaker' : 'speaker-mute'}`;
    const pct = Math.round(s.volume * 100);
    const tip = on ? { en: `Volume (${pct}%)`, zh: `音量（${pct}%）` } : { en: 'Volume (muted)', zh: '音量（已静音）' };
    btn.dataset.tip = tip.en;
    btn.dataset.tipZh = tip.zh;
    btn.dataset.ariaLabelEn = tip.en;
    btn.dataset.ariaLabelZh = tip.zh;
    btn.setAttribute('aria-label', tr(tip));
  };
  sync();
  settings.on(sync);
  let clickTimer = 0;
  btn.addEventListener('click', () => {
    clearTimeout(clickTimer);
    clickTimer = window.setTimeout(() => (pop ? closePop() : openPop()), 220);
  });
  btn.addEventListener('dblclick', () => {
    clearTimeout(clickTimer);
    closePop();
    commands.run('sounds-properties');
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pop) closePop();
  });
}
