// The Projects folder: views, the Web View pane, selection, Details sorting.
// Page content: it works on its own and asks the desktop (window.kus98) for more.

type View = 'thumbs' | 'list' | 'details';

function initSort(table: HTMLTableElement) {
  const heads = [...table.tHead!.rows[0].cells];
  heads.forEach((th, i) => {
    th.tabIndex = 0;
    const sort = () => {
      const asc = th.dataset.dir !== 'asc';
      heads.forEach((h) => delete h.dataset.dir);
      th.dataset.dir = asc ? 'asc' : 'desc';
      const num = th.dataset.sort === 'num';
      const rows = [...table.tBodies[0].rows];
      rows.sort((a, b) => {
        const x = a.cells[i].textContent!.trim();
        const y = b.cells[i].textContent!.trim();
        const d = num ? Number(x) - Number(y) : x.localeCompare(y);
        return asc ? d : -d;
      });
      table.tBodies[0].append(...rows);
    };
    th.addEventListener('click', sort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        sort();
      }
    });
  });
}

/** Details rows: click selects, double-click (or Enter) opens. */
function initRows(table: HTMLTableElement) {
  const select = (tr: HTMLTableRowElement) => {
    table.querySelectorAll('tr.highlighted').forEach((r) => r.classList.remove('highlighted'));
    tr.classList.add('highlighted');
    tr.focus({ preventScroll: true });
  };
  const open = (tr: HTMLTableRowElement) => {
    const href = tr.dataset.href;
    if (!href) return;
    if (window.kus98) window.kus98.open(href);
    else location.href = href;
  };
  table.tBodies[0].addEventListener('click', (e) => {
    const tr = (e.target as Element).closest<HTMLTableRowElement>('tr[data-href]');
    if (!tr || (e.target as Element).closest('a')) return;
    select(tr);
    // Folder Options ▸ single-click (and touch screens): one click opens.
    if (document.documentElement.dataset.click === 'single' || (e as PointerEvent).pointerType === 'touch') open(tr);
  });
  table.tBodies[0].addEventListener('dblclick', (e) => {
    const tr = (e.target as Element).closest<HTMLTableRowElement>('tr[data-href]');
    if (tr && !(e.target as Element).closest('a')) open(tr);
  });
  table.tBodies[0].addEventListener('keydown', (e) => {
    const tr = (e.target as Element).closest<HTMLTableRowElement>('tr[data-href]');
    if (!tr) return;
    if (e.key === 'Enter') open(tr);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = (e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling) as HTMLTableRowElement | null;
      if (next) select(next);
    }
  });
}

export function initExplorerFolder() {
  for (const page of document.querySelectorAll<HTMLElement>('[data-folder-page]:not([data-ready])')) {
    page.dataset.ready = '1';
    const win = page.closest<HTMLElement>('[data-window]');
    const k = window.kus98;
    const list = page.querySelector<HTMLElement>('.projects-view')!;
    const table = page.querySelector<HTMLTableElement>('table[data-sortable]');
    if (table) {
      initSort(table);
      initRows(table);
    }

    // The view, kept in this browser (View menu, Views button).
    const setView = (v: View) => (page.dataset.view = v);
    if (k) {
      setView(k.settings.get().explorerView);
      const off = k.settings.on((s) => {
        if (!page.isConnected) return off();
        setView(s.explorerView);
      });
    }

    // Select with a click, open with a double-click, like any folder.
    k?.bindIcons(list);

    // Web View: what's selected, and the status bar.
    const wv = win?.querySelector<HTMLElement>('[data-webview]');
    const fields = win?.querySelectorAll<HTMLElement>(':scope > [data-window-inner] > .status-bar .status-bar-field');
    const count = list.querySelectorAll('.icon').length;
    list.addEventListener('icons:select', () => {
      const sel = [...list.querySelectorAll<HTMLElement>('.icon.selected')];
      const one = sel.length === 1 ? sel[0] : null;
      if (wv) {
        wv.querySelector<HTMLElement>('.wv-default')!.hidden = !!one;
        const item = wv.querySelector<HTMLElement>('.wv-item')!;
        item.hidden = !one;
        if (one) {
          const img = item.querySelector<HTMLImageElement>('.wv-thumb')!;
          img.src = one.dataset.thumb ?? '';
          item.querySelector('.wv-name')!.textContent = one.querySelector('.icon-label')?.textContent ?? '';
          item.querySelector('.wv-desc')!.textContent = one.dataset.desc ?? '';
          item.querySelector('.wv-facts')!.textContent = one.dataset.facts ?? '';
          item.querySelector('.wv-room')!.textContent = one.dataset.room ?? '';
        }
      }
      if (fields?.[0]) fields[0].textContent = sel.length ? `${sel.length} object(s) selected` : `${count} object(s)`;
      if (fields?.[1]) fields[1].textContent = one ? one.dataset.facts ?? '' : 'Double-click a project to open it.';
    });
  }
}
