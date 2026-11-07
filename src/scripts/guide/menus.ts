// Field Guide (导览): the menu bar (File, Edit, View, Days, Routes, Help), asked
// each time a menu opens so ticks and greyed items follow the state. Chinese
// follows the Chinese edition of Windows 98. Day and route names come from
// the guide's payload; nothing here names a guide.
import type { MenuSpec } from '../desktop/menu';
import { dayLabel } from '../../lib/guides/core';
import type { GuideApp } from './app';
import type { Sort, View } from './state';
import { SW } from '../../lib/guides/suggest-words';

export function menuProvider(app: GuideApp) {
  return (name: string): MenuSpec[] | null => {
    const s = app.store.get();
    const p = app.p;
    const v = app.view();
    const hasDays = !!p.window;
    switch (name) {
      case 'file':
        return [
          // A chooser only makes sense with several listed guides.
          ...(app.guides.length > 1 ? [{ label: '&Open Guide...', zh: '打开导览(&O)...', icon: 'guide', action: () => app.openGuide() }, { sep: true }] : []),
          { label: 'Open in &Google Maps', zh: '在 Google 地图中打开(&G)', disabled: !s.place, action: () => app.openLink(0) },
          { label: 'Get &Directions', zh: '获取路线(&D)', disabled: !s.place && !s.route, action: () => app.openLink(1) },
          { sep: true },
          { label: SW.menu.en, zh: SW.menu.zh, icon: 'guide', action: () => app.root.dispatchEvent(new Event('gd:suggest')) },
          { sep: true },
          { label: '&Print...', zh: '打印(&P)...', key: 'Ctrl+P', action: () => window.print() },
          { sep: true },
          { label: '&Log Off...', zh: '注销(&L)...', action: () => void app.logOff() },
          { label: '&Close', zh: '关闭(&C)', key: 'Alt+F4', action: () => (window.kus98 ? window.kus98.close(app.win) : history.back()) },
        ];
      case 'edit':
        return [
          { label: 'Copy A&ddress', zh: '复制地址(&D)', disabled: !s.place, action: () => void app.copyAddress() },
          { label: 'Copy &Link', zh: '复制链接(&L)', action: () => void app.copyLink() },
          { sep: true },
          { label: '&Find...', zh: '查找(&F)...', key: 'Ctrl+F', action: () => app.focusFind() },
          { label: 'Clea&r Filters', zh: '清除筛选条件(&R)', disabled: !s.q && !s.theme, action: () => { app.store.set({ q: '', theme: '' }); app.syncControls(); } },
        ];
      case 'view': {
        const pane = (id: View, label: string, zh: string): MenuSpec => ({ label, zh, radio: true, checked: v === id, action: () => app.setView(id) });
        const zoom: MenuSpec[] = [
          { label: 'Zoom &In', zh: '放大(&I)', key: '+', disabled: !app.map, action: () => app.map?.zoomBy(1.6) },
          { label: 'Zoom &Out', zh: '缩小(&O)', key: '-', disabled: !app.map, action: () => app.map?.zoomBy(1 / 1.6) },
          { label: '&Whole Map', zh: '整个地图(&W)', key: 'Home', disabled: !app.map, action: () => app.map?.home() },
          ...(s.place ? [{ sep: true }, { label: '&Selected Place', zh: '所选地点(&S)', action: () => app.map?.fitTo([s.place!]) }] : []),
        ];
        // The Places list's order, as "Sort by:" in its pane (Arrange Icons in Windows 98).
        const inUse = app.places.inUse(s);
        const by = (id: Sort, label: string, zh: string): MenuSpec => ({ label, zh, radio: true, checked: inUse === id, disabled: !app.places.can(id, s), action: () => app.places.pick(id) });
        const sort: MenuSpec[] = [
          by('tier', '&Default Order', '默认顺序(&D)'),
          { sep: true },
          by('name', 'by &Name', '按名称(&N)'),
          by('zone', 'by &Area', '按区域(&A)'),
          ...(hasDays ? [by('open', '&Open That Day First', '当天开放的优先(&O)')] : []),
          by('near', 'Nearest &First', '离我最近(&F)'),
        ];
        return [
          pane('map', '&Map', '地图(&M)'),
          pane('places', '&Places', '地点(&P)'),
          pane('routes', '&Routes', '路线(&R)'),
          ...(hasDays ? [pane('days', '&Days', '日期(&D)')] : []),
          pane('info', '&Info', '说明(&I)'),
          { sep: true },
          ...(p.listings.some((l) => !l.item) ? [{ label: 'Official &Entries', zh: '官方条目(&E)', checked: s.listings, action: () => { app.store.set({ listings: !s.listings }); app.syncControls(); } }] : []),
          // O, not S: Stop Showing My Location has S. The Sort by: list in the Places pane uses O too (words.ts).
          { label: 'S&ort By', zh: '排序方式(&O)', sub: sort },
          ...(p.map.views.length > 1 ? [{ label: '&Area', zh: '区域(&A)', sub: p.map.views.map((m) => ({ label: m.name.en, zh: m.name.zh || m.name.en, radio: true, checked: s.area === m.id, action: () => app.store.set({ area: m.id }) })) }] : []),
          { label: '&Heat Map', zh: '热力图(&H)', checked: s.heat, disabled: !app.map, action: () => app.store.set({ heat: !s.heat }) },
          { label: '&Labels', zh: '标签(&L)', checked: s.labels, disabled: !app.map, action: () => app.store.set({ labels: !s.labels }) },
          { label: '&Zoom', zh: '缩放(&Z)', sub: zoom },
          { sep: true },
          // Where Am I? starts following you; while it does, it shows you and the nearest again.
          { label: '&Where Am I?', zh: '我在哪里？(&W)', disabled: !app.map, action: () => app.whereAmI() },
          { label: 'Stop &Showing My Location', zh: '不再显示我的位置(&S)', disabled: !app.locating, action: () => app.stopLocating(true) },
          { sep: true },
          { label: '&Toolbar', zh: '工具栏(&T)', checked: !(app.win.dataset.hide ?? '').split(' ').includes('toolbar'), action: () => app.toggleBar('toolbar') },
          { label: 'Status &Bar', zh: '状态栏(&B)', checked: !(app.win.dataset.hide ?? '').split(' ').includes('status'), action: () => app.toggleBar('status') },
          { sep: true },
          { label: 'Re&fresh', zh: '刷新(&F)', key: 'F5', action: () => app.refresh() },
        ];
      }
      case 'days': {
        const days = p.window?.days ?? [];
        if (!days.length) return [{ label: '&Any Day', zh: '任意一天(&A)', radio: true, checked: true }];
        const hol = (d: string) => p.holidays.find((h) => h.date === d);
        const inWindow = days.includes(app.today);
        return [
          { label: '&Any Day', zh: '任意一天(&A)', radio: true, checked: s.day === 'any', action: () => app.setDay('any') },
          { sep: true },
          ...days.map((d) => {
            const l = dayLabel(d), h = hol(d), k = d.slice(-1);
            const today = d === app.today;
            return {
              label: `${l.en.replace(/(\d)(?!.*\d)/, '&$1')}${h ? ` - ${h.name.en}` : ''}${today ? ' (Today)' : ''}`,
              zh: `${l.zh}${h ? ` - ${h.name.zh || h.name.en}` : ''}${today ? '（今天）' : ''}(&${k})`,
              radio: true, checked: s.day === d, action: () => app.setDay(d),
            };
          }),
          { sep: true },
          { label: '&Today', zh: '今天(&T)', disabled: !inWindow, action: () => app.setDay(app.today) },
          { label: '&Previous Day', zh: '前一天(&P)', disabled: s.day === days[0], action: () => app.stepDay(-1) },
          { label: '&Next Day', zh: '后一天(&N)', disabled: s.day === days[days.length - 1], action: () => app.stepDay(1) },
          { sep: true },
          { label: '&Day by Day', zh: '日程表(&D)', action: () => app.setView('days') },
        ];
      }
      case 'routes':
        return [
          { label: '&No Route', zh: '无路线(&N)', radio: true, checked: !s.route, action: () => app.setRoute(null) },
          { sep: true },
          ...p.routes.map((r, i) => ({
            label: `${i < 9 ? '&' : ''}${i + 1} ${r.name.en}`,
            zh: `${i + 1} ${r.name.zh || r.name.en}${i < 9 ? `(&${i + 1})` : ''}`,
            radio: true, checked: s.route === r.id, action: () => app.setRoute(r.id, true),
          })),
          { sep: true },
          { label: 'Show &Directions in Google Maps', zh: '在 Google 地图中查看路线(&D)', disabled: !s.route, action: () => app.openLink(0, true) },
          { label: 'Route &List', zh: '路线列表(&L)', action: () => app.setView('routes') },
        ];
      case 'help':
        return [
          { label: '&Help Topics', zh: '帮助主题(&H)', key: 'F1', icon: 'help', action: () => app.help() },
          { label: 'How to &Use This Guide', zh: '如何使用本导览(&U)', action: () => app.setView('info') },
          { sep: true },
          { label: '&About Field Guide', zh: '关于导览(&A)', action: () => app.about() },
        ];
    }
    return null;
  };
}
