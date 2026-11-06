// The taskbar: a button per window, Show Desktop, the clock, the Start menu.
import * as wm from './wm';

function renderTasks(tasks: HTMLElement) {
  const act = wm.getActive();
  const seen = new Set<string>();
  for (const w of wm.list()) {
    if (!w.task) continue;
    const id = String(w.id);
    seen.add(id);
    let b = tasks.querySelector<HTMLButtonElement>(`.task[data-win-id="${id}"]`);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.className = 'task';
      b.dataset.winId = id;
      b.innerHTML = '<span class="ico ico16" aria-hidden="true"></span><span class="task-label"></span>';
      tasks.appendChild(b);
    }
    const title = wm.titleOf(w);
    b.querySelector('.ico')!.className = `ico ico16 ico-${w.el.dataset.icon ?? 'folder'}`;
    b.querySelector('.task-label')!.textContent = title;
    b.title = title;
    b.setAttribute('aria-pressed', String(w === act && w.state !== 'min'));
  }
  for (const b of tasks.querySelectorAll<HTMLElement>('.task')) if (!seen.has(b.dataset.winId!)) b.remove();
}

function startClock() {
  const el = document.getElementById('clock') as HTMLTimeElement | null;
  if (!el) return;
  const tick = () => {
    const d = new Date();
    el.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    el.dateTime = d.toISOString();
    el.title = d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    setTimeout(tick, 60000 - (Date.now() % 60000) + 50);
  };
  tick();
}

/** The Start menu without the full menu widget: open, close, close on choice. */
function initStartBasics() {
  const start = document.getElementById('start') as HTMLDetailsElement | null;
  if (!start) return;
  document.addEventListener('pointerdown', (e) => {
    if (start.open && !start.contains(e.target as Node)) start.open = false;
  });
  start.addEventListener('click', (e) => {
    const item = (e.target as Element).closest('.menu-item');
    if (item && !item.closest('.has-sub > .menu-item')) start.open = false;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && start.open) {
      start.open = false;
      start.querySelector('summary')?.focus();
    }
  });
}

export function initTaskbar() {
  const tasks = document.getElementById('tasks');
  if (tasks) {
    const render = () => renderTasks(tasks);
    document.addEventListener('wm:change', render);
    render();
    tasks.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('.task');
      const w = b && wm.byId(Number(b.dataset.winId));
      if (!w) return;
      if (w === wm.getActive() && w.state !== 'min') wm.minimize(w);
      else wm.focus(w);
    });
  }
  document.querySelector('[data-cmd="show-desktop"]')?.addEventListener('click', () => wm.showDesktop());
  startClock();
  initStartBasics();
}
