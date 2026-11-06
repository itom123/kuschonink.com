// Named commands (Start menu items, menus, buttons with data-cmd="…").
// Modules register what they can do; anything can run a command by name.

export interface CmdContext {
  /** The element the command came from (a menu item, an icon…). */
  el?: Element | null;
  x?: number;
  y?: number;
}

type Cmd = (ctx: CmdContext) => void;
const cmds = new Map<string, Cmd>();

export const commands = {
  register(name: string, fn: Cmd) {
    cmds.set(name, fn);
  },
  has: (name: string) => cmds.has(name),
  run(name: string, ctx: CmdContext = {}) {
    const f = cmds.get(name);
    if (f) f(ctx);
    return !!f;
  },
};

/** Buttons with a registered data-cmd anywhere on the desktop run their command. */
export function initCommands() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const el = (e.target as Element).closest<HTMLElement>('[data-cmd]');
    const name = el?.dataset.cmd;
    if (!name || !cmds.has(name) || el.getAttribute('aria-disabled') === 'true') return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    commands.run(name, { el, x: r.left, y: r.bottom });
  });
}
