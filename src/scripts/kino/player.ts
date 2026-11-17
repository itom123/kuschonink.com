// Kino's player: one film in the Kino's window (src/pages/kino/[film].astro).
// The page holds no source. Play asks the Worker where the film plays from
// (/kino/<film>/play); without a ticket, the box office gives one first
// (ticket.ts). A film on R2 plays as HLS through hls.js (loaded only then),
// or through the browser's own player where there is no Media Source (older
// iPhones); a film still on YouTube plays in YouTube's player.
//
// Like every page script (docs/DESKTOP.md): it starts once per window, finds
// everything from its root, only answers keys while its window is in front,
// and cleans up when the window closes or moves on to another page.
import type Hls from 'hls.js';
import { clock } from '../../lib/kino';
import { desktop, h, message, setAttr, setText, tr, type Bi } from '../paint/dom';
import { getTicket } from './ticket';

type Play =
  | { kind: 'hls'; src: string; poster: string; width: number; height: number; exp: number }
  | { kind: 'youtube'; id: string };

interface MenuSpec { label?: string; zh?: string; icon?: string; sep?: boolean; disabled?: boolean; checked?: boolean; radio?: boolean; key?: string; sub?: MenuSpec[]; action?: () => void }
type Kus98 = { menus?(el: Element, provider: (name: string) => MenuSpec[] | null): void; open(url: string): Promise<void>; close(el: Element): void };

const S: Record<string, Bi> = {
  ready: { en: 'Ready', zh: '就绪' },
  ticket: { en: 'Getting a ticket…', zh: '正在取票……' },
  opening: { en: 'Opening…', zh: '正在打开……' },
  playing: { en: 'Playing', zh: '正在播放' },
  paused: { en: 'Paused', zh: '已暂停' },
  stopped: { en: 'Stopped', zh: '已停止' },
  buffering: { en: 'Buffering…', zh: '正在缓冲……' },
  finished: { en: 'Finished', zh: '已结束' },
  youtube: { en: 'Playing from YouTube', zh: '从 YouTube 播放' },
};
const NOTE: Record<string, Bi> = {
  cookies: { en: 'The Kino needs a cookie for your ticket. Allow cookies (Start ▸ Settings ▸ Cookies), then press Play again.', zh: 'Kino 需要使用 Cookie 来保存你的入场券。请允许 Cookie（开始 ▸ 设置 ▸ Cookie），然后再按“播放”。' },
  cancelled: { en: 'No ticket yet. Press Play to try again.', zh: '还没有入场券。按“播放”重试。' },
  closed: { en: 'The Kino is closed just now. Please come back later.', zh: 'Kino 暂时关闭。请稍后再来。' },
  failed: { en: 'The film could not be opened. Please try again in a moment.', zh: '无法打开这部影片。请稍后再试。' },
  unsupported: { en: 'This browser can’t play the film. Please try another browser.', zh: '这个浏览器无法播放这部影片。请换一个浏览器试试。' },
};

export class KinoPlayer {
  private readonly win: HTMLElement;
  private readonly ac = new AbortController();
  private readonly film: string;
  private readonly seconds: number;
  private readonly stage: HTMLElement;
  private readonly screen: HTMLElement;
  private readonly curtain: HTMLElement;
  private readonly note: HTMLElement;
  private readonly seek: HTMLInputElement;
  private readonly volume: HTMLInputElement;
  private readonly time: HTMLElement;
  private readonly quality: HTMLSelectElement;
  private readonly fields: HTMLElement[];
  private video: HTMLVideoElement | null = null;
  private frame: HTMLIFrameElement | null = null;
  private hls: Hls | null = null;
  private kind: Play['kind'] | null = null;
  private starting = false;
  private seeking = false;
  private recovering = 0;
  private dead = false;

  constructor(private readonly root: HTMLElement) {
    this.win = root.closest<HTMLElement>('[data-window]') ?? root;
    this.film = root.dataset.kinoFilm!;
    this.seconds = Number(root.dataset.kinoSeconds) || 0;
    const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
    this.stage = q('[data-kino-stage]');
    this.screen = q('[data-kino-screen]');
    this.curtain = q('[data-kino-curtain]');
    this.note = q('[data-kino-note]');
    this.seek = q('[data-kino-seek]');
    this.volume = q('[data-kino-volume]');
    this.time = q('[data-kino-time]');
    this.quality = q('[data-kino-quality]');
    this.fields = [...this.win.querySelectorAll<HTMLElement>(':scope > [data-window-inner] > .status-bar > .status-bar-field')];
    this.bind();
  }

  // ---- Wiring ----

  private bind() {
    const signal = this.ac.signal;
    this.root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-kino-cmd]');
      if (b && this.root.contains(b)) this.run(b.dataset.kinoCmd!);
    }, { signal });
    this.seek.addEventListener('input', () => {
      const v = this.video;
      if (!v || !Number.isFinite(v.duration)) return;
      this.seeking = true;
      v.currentTime = (Number(this.seek.value) / 1000) * v.duration;
      this.showTime();
    }, { signal });
    this.seek.addEventListener('change', () => (this.seeking = false), { signal });
    this.volume.addEventListener('input', () => {
      if (!this.video) return;
      this.video.volume = Number(this.volume.value) / 100;
      this.video.muted = this.video.volume === 0;
    }, { signal });
    this.quality.addEventListener('change', () => {
      if (this.hls) this.hls.currentLevel = Number(this.quality.value);
      this.showQuality();
    }, { signal });
    // A double-click on the picture: Full Screen, as media players do.
    this.screen.addEventListener('dblclick', () => this.video && this.fullScreen(), { signal });
    document.addEventListener('keydown', (e) => this.key(e), { signal });
    document.addEventListener('fullscreenchange', () => this.stage.classList.toggle('is-full', document.fullscreenElement === this.stage), { signal });
    // The window closes, or moves on to another page: stop and let go.
    this.win.addEventListener('desktop:close', () => this.destroy(), { once: true, signal });
    const gone = () => !this.root.isConnected && this.destroy();
    this.win.addEventListener('desktop:content', gone, { signal });
    document.addEventListener('astro:page-load', gone, { signal });
    (desktop() as unknown as Kus98 | undefined)?.menus?.(this.win, (name) => this.menu(name));
  }

  private destroy() {
    if (this.dead) return;
    this.dead = true;
    this.ac.abort();
    this.hls?.destroy();
    this.hls = null;
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    }
    this.frame?.remove();
    if (document.fullscreenElement === this.stage) void document.exitFullscreen().catch(() => {});
  }

  /** The window is in front, so its keys are ours (as Paint's isActive). */
  private active() {
    return this.root.isConnected && this.win.dataset.state !== 'min' && (this.win === this.root || this.win.hasAttribute('data-active')) && !this.win.querySelector(':scope > [data-window-inner][inert]');
  }

  private key(e: KeyboardEvent) {
    if (!this.active() || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as Element | null;
    if (t?.closest('input:not([type="range"]), select, textarea, [contenteditable], .menu, [role="menu"], dialog')) return;
    if (t?.closest('input[type="range"]') && /^Arrow|^Home$|^End$|^Page/.test(e.key)) return; // the slider moves itself
    const v = this.video;
    const did = (() => {
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          if (t?.closest('button, a')) return false;
          this.run(v ? 'toggle' : 'play');
          return true;
        case 'f':
        case 'F':
          this.fullScreen();
          return true;
        case 'm':
        case 'M':
          if (v) this.run('mute');
          return !!v;
        case 'ArrowLeft':
          if (v) v.currentTime = Math.max(0, v.currentTime - 5);
          return !!v;
        case 'ArrowRight':
          if (v) v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 5);
          return !!v;
        case 'ArrowUp':
          if (v) this.setVolume(v.volume + 0.1);
          return !!v;
        case 'ArrowDown':
          if (v) this.setVolume(v.volume - 0.1);
          return !!v;
        default:
          return false;
      }
    })();
    if (did) e.preventDefault();
  }

  run(cmd: string) {
    const v = this.video;
    switch (cmd) {
      case 'play':
        if (v) void v.play().catch(() => {});
        else void this.start();
        break;
      case 'toggle':
        if (!v) void this.start();
        else if (v.paused || v.ended) void v.play().catch(() => {});
        else v.pause();
        break;
      case 'stop':
        if (v) {
          v.pause();
          v.currentTime = 0;
          this.status(S.stopped);
        }
        break;
      case 'mute':
        if (v) v.muted = !v.muted;
        break;
      case 'fullscreen':
        this.fullScreen();
        break;
    }
  }

  // ---- Starting a film ----

  private async start() {
    if (this.starting || this.kind) return;
    this.starting = true;
    this.say(null);
    try {
      const play = await this.where();
      if (!play || this.dead) return;
      if (play.kind === 'youtube') this.youtube(play.id);
      else await this.hlsPlay(play);
    } finally {
      this.starting = false;
    }
  }

  /** Where the film plays from; a ticket first when there is none. */
  private async where(): Promise<Play | null> {
    for (let i = 0; i < 2; i++) {
      this.status(S.opening);
      let res: Response;
      try {
        res = await fetch(`/kino/${this.film}/play`, { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
      } catch {
        this.fail(NOTE.failed);
        return null;
      }
      if (res.ok) return (await res.json()) as Play;
      if (res.status === 401 && i === 0) {
        this.status(S.ticket);
        const t = await getTicket(this.root, this.root.dataset.sitekey);
        if (t !== 'ok') {
          this.fail(NOTE[t]);
          return null;
        }
        continue;
      }
      this.fail(res.status === 503 ? NOTE.closed : NOTE.failed);
      return null;
    }
    return null;
  }

  private youtube(id: string) {
    this.kind = 'youtube';
    const lang = document.documentElement.dataset.lang === 'zh' ? 'zh-Hans' : 'en';
    this.frame = h('iframe', {
      class: 'kino-frame-yt',
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&hl=${lang}`,
      title: { en: this.root.dataset.kinoTitleEn ?? 'Film', zh: this.root.dataset.kinoTitleZh ?? '影片' },
      allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
      allowfullscreen: true,
      referrerpolicy: 'strict-origin-when-cross-origin',
    });
    this.curtain.hidden = true;
    this.screen.append(this.frame);
    this.root.classList.add('is-youtube');
    // YouTube's player has its own buttons; Full Screen stays ours (the whole stage).
    this.enable(['fullscreen']);
    this.status(S.youtube);
    this.field(2, 'YouTube');
  }

  private async hlsPlay(p: Extract<Play, { kind: 'hls' }>) {
    const v = h('video', {
      class: 'kino-video',
      playsinline: true,
      preload: 'auto',
      poster: p.poster,
      controlslist: 'nodownload noremoteplayback noplaybackrate',
      disableremoteplayback: true,
      'aria-label': { en: this.root.dataset.kinoTitleEn ?? 'Film', zh: this.root.dataset.kinoTitleZh ?? '影片' },
    });
    v.style.aspectRatio = `${p.width} / ${p.height}`;
    this.video = v;
    this.kind = 'hls';
    this.watch(v);
    this.curtain.hidden = true;
    this.screen.append(v);
    this.root.classList.add('is-playing');
    this.enable(['toggle', 'stop', 'mute', 'fullscreen']);

    let HlsClass: typeof Hls | null = null;
    try {
      HlsClass = (await import('hls.js/light')).default as unknown as typeof Hls;
    } catch {
      HlsClass = null;
    }
    if (this.dead) return;
    if (HlsClass?.isSupported()) {
      const hls = new HlsClass({
        // The best picture the connection carries, whatever the window's size: the films are shown whole.
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 8_000_000,
        maxBufferLength: 30,
        preferManagedMediaSource: true,
        enableWorker: true,
      });
      this.hls = hls;
      hls.on(HlsClass.Events.MANIFEST_PARSED, () => this.levels());
      hls.on(HlsClass.Events.LEVEL_SWITCHED, () => this.showQuality());
      hls.on(HlsClass.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        const code = (data.response as { code?: number } | undefined)?.code;
        if (data.type === HlsClass!.ErrorTypes.NETWORK_ERROR && (code === 401 || code === 403)) void this.renew();
        else if (data.type === HlsClass!.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else this.fail(NOTE.failed);
      });
      hls.loadSource(p.src);
      hls.attachMedia(v);
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari's own player (it decrypts too). No quality menu: it chooses.
      v.src = p.src;
    } else {
      this.fail(NOTE.unsupported);
      return;
    }
    void v.play().catch(() => this.status(S.paused));
  }

  /** The links ran out (or the ticket did): new ones, from where the film is. At most three times. */
  private async renew() {
    if (++this.recovering > 3 || !this.hls) return this.fail(NOTE.failed);
    const at = this.video?.currentTime ?? 0;
    const play = await this.where();
    if (!play || play.kind !== 'hls' || !this.hls || !this.video) return;
    this.hls.loadSource(play.src);
    this.hls.startLoad(at);
    this.video.currentTime = at;
    void this.video.play().catch(() => {});
  }

  private watch(v: HTMLVideoElement) {
    const signal = this.ac.signal;
    const on = (ev: string, f: () => void) => v.addEventListener(ev, f, { signal });
    on('play', () => this.playing(true));
    on('playing', () => this.status(S.playing));
    on('pause', () => {
      this.playing(false);
      if (!v.ended && v.currentTime > 0) this.status(S.paused);
    });
    on('waiting', () => this.status(S.buffering));
    on('ended', () => {
      this.playing(false);
      this.status(S.finished);
    });
    on('timeupdate', () => this.showTime());
    on('durationchange', () => this.showTime());
    on('volumechange', () => {
      this.volume.value = String(Math.round((v.muted ? 0 : v.volume) * 100));
      const icon = this.root.querySelector('[data-kino-muteicon]');
      icon?.classList.toggle('ico-speaker', !v.muted);
      icon?.classList.toggle('ico-speaker-mute', v.muted);
    });
  }

  // ---- Showing what happens ----

  private playing(on: boolean) {
    const icon = this.root.querySelector('[data-kino-playicon]');
    icon?.classList.toggle('ico-tb-play', !on);
    icon?.classList.toggle('ico-tb-pause', on);
    const label = this.root.querySelector('[data-kino-playlabel]');
    if (label) setText(label, on ? { en: 'Pause', zh: '暂停' } : { en: 'Play', zh: '播放' });
    const b = this.root.querySelector('[data-kino-cmd="toggle"]');
    if (b) setAttr(b, 'title', on ? { en: 'Pause (Space)', zh: '暂停（空格键）' } : { en: 'Play (Space)', zh: '播放（空格键）' });
  }

  private showTime() {
    const v = this.video;
    if (!v) return;
    const total = Number.isFinite(v.duration) ? v.duration : this.seconds;
    const text = total ? `${clock(v.currentTime)} / ${clock(total)}` : clock(v.currentTime);
    this.time.textContent = text;
    this.field(1, text);
    if (!this.seeking && total) this.seek.value = String(Math.round((v.currentTime / total) * 1000));
    this.seek.setAttribute('aria-valuetext', text);
  }

  private levels() {
    const hls = this.hls;
    if (!hls) return;
    const opts = hls.levels
      .map((l, i) => ({ i, height: l.height }))
      .sort((a, b) => b.height - a.height);
    const top = opts[0]?.height;
    this.quality.replaceChildren(
      option('-1', { en: 'Auto', zh: '自动' }),
      ...opts.map((o) => option(String(o.i), o.height === top ? { en: `${o.height}p (highest)`, zh: `${o.height}p（最高）` } : `${o.height}p`)),
    );
    this.quality.value = '-1';
    (this.root.querySelector('[data-kino-quality-wrap]') as HTMLElement).hidden = opts.length < 2;
    this.showQuality();
  }

  private showQuality() {
    const hls = this.hls;
    if (!hls) return;
    const lvl = hls.levels[hls.currentLevel];
    const now = lvl ? `${lvl.height}p` : '';
    this.field(2, hls.autoLevelEnabled ? (now ? { en: `Auto · ${now}`, zh: `自动 · ${now}` } : { en: 'Auto', zh: '自动' }) : now);
  }

  private status(b: Bi) {
    this.field(0, b);
  }

  private field(i: number, t: string | Bi) {
    const f = this.fields[i];
    if (f) setText(f, t);
  }

  private say(b: Bi | null) {
    this.note.hidden = !b;
    if (b) setText(this.note, b);
  }

  private fail(b: Bi) {
    this.status(S.ready);
    if (this.kind) {
      void message({ title: { en: 'Kino', zh: 'Kino' }, text: b, icon: 'warning', owner: this.root });
      return;
    }
    this.curtain.hidden = false;
    this.say(b);
  }

  private enable(cmds: string[]) {
    for (const c of cmds) this.root.querySelector<HTMLButtonElement>(`[data-kino-cmd="${c}"]`)?.removeAttribute('disabled');
    if (cmds.includes('toggle')) {
      this.seek.disabled = false;
      this.volume.disabled = false;
    }
  }

  private setVolume(x: number) {
    if (!this.video) return;
    this.video.volume = Math.min(1, Math.max(0, x));
    this.video.muted = this.video.volume === 0;
  }

  private fullScreen() {
    const v = this.video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (this.stage.requestFullscreen) void this.stage.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    else v?.webkitEnterFullscreen?.(); // iPhone: only a video goes full screen, in the system's own player
  }

  // ---- Menus ----

  private menu(name: string): MenuSpec[] | null {
    const d = desktop() as unknown as Kus98 | undefined;
    const v = this.video;
    const on = !!v && !v.paused && !v.ended;
    switch (name) {
      case 'file':
        return [
          { label: '&All Films', zh: '全部影片(&A)', icon: 'kino', action: () => void d?.open('/kino') },
          { sep: true },
          { label: '&Close', zh: '关闭(&C)', action: () => d?.close(this.win) },
        ];
      case 'view': {
        const items: MenuSpec[] = [{ label: '&Full Screen', zh: '全屏(&F)', key: 'F', disabled: !this.video && !this.frame, action: () => this.fullScreen() }];
        const hls = this.hls;
        if (hls && hls.levels.length > 1) {
          const opts = hls.levels.map((l, i) => ({ i, height: l.height })).sort((a, b) => b.height - a.height);
          items.push({ sep: true }, {
            label: '&Quality', zh: '画质(&Q)',
            sub: [
              { label: '&Auto', zh: '自动(&A)', radio: true, checked: hls.autoLevelEnabled, action: () => this.pick(-1) },
              ...opts.map((o) => ({ label: `${o.height}p`, radio: true, checked: !hls.autoLevelEnabled && hls.currentLevel === o.i, action: () => this.pick(o.i) })),
            ],
          });
        }
        return items;
      }
      case 'play':
        return [
          { label: on ? '&Pause' : '&Play', zh: on ? '暂停(&P)' : '播放(&P)', key: 'Space', disabled: this.kind === 'youtube', action: () => this.run(v ? 'toggle' : 'play') },
          { label: '&Stop', zh: '停止(&S)', disabled: !v, action: () => this.run('stop') },
          { sep: true },
          { label: '&Back 5 Seconds', zh: '后退 5 秒(&B)', key: '←', disabled: !v, action: () => v && (v.currentTime = Math.max(0, v.currentTime - 5)) },
          { label: '&Forward 5 Seconds', zh: '前进 5 秒(&F)', key: '→', disabled: !v, action: () => v && (v.currentTime += 5) },
          { sep: true },
          { label: '&Mute', zh: '静音(&M)', key: 'M', checked: !!v?.muted, disabled: !v, action: () => this.run('mute') },
          { label: 'Volume &Up', zh: '增大音量(&U)', key: '↑', disabled: !v, action: () => this.setVolume((v?.volume ?? 1) + 0.1) },
          { label: 'Volume &Down', zh: '减小音量(&D)', key: '↓', disabled: !v, action: () => this.setVolume((v?.volume ?? 1) - 0.1) },
        ];
      case 'help':
        return kinoHelp(this.root);
      default:
        return null;
    }
  }

  private pick(level: number) {
    if (!this.hls) return;
    this.hls.currentLevel = level;
    this.quality.value = String(level);
    this.showQuality();
  }
}

/** An <option> can hold no spans: the language showing, and both for the 中/EN switch (data-text-en / -zh, src/scripts/lang.ts). */
function option(value: string, t: string | Bi): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value;
  if (typeof t === 'string') o.textContent = t;
  else {
    o.textContent = tr(t);
    o.dataset.textEn = t.en;
    o.dataset.textZh = t.zh;
  }
  return o;
}

/** Help ▸ Help Topics and About Kino (the lobby has the same). */
export function kinoHelp(owner: Element): MenuSpec[] {
  const d = desktop() as unknown as Kus98 | undefined;
  return [
    { label: '&Help Topics', zh: '帮助主题(&H)', icon: 'help', action: () => void d?.open('/help#kino') },
    { sep: true },
    {
      label: '&About Kino', zh: '关于 Kino(&A)',
      action: () => void message({
        title: { en: 'About Kino', zh: '关于 Kino' },
        icon: 'info',
        owner,
        text: {
          en: 'Kino shows the artist’s films at their full quality. They play only here, and can’t be saved: they are protected by copyright.',
          zh: 'Kino 以完整画质放映艺术家的影像作品。它们只在这里放映，不能保存：它们受版权保护。',
        },
      }),
    },
  ];
}
