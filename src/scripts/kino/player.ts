// Kino's player: one film in the Kino's window (src/pages/kino/[film].astro),
// laid out like Windows Media Player 6.4: the screen, the seek bar, the
// control bar with its LCD panel, the clip panel. The page holds no source.
// Play asks the Worker where the film plays from (/kino/<film>/play); without
// a ticket, the check runs on the screen first (ticket.ts), and shows nothing
// unless Cloudflare asks. A film on R2 plays as HLS through hls.js (loaded
// only then), or through the browser's own player where there is no Media
// Source (older iPhones); a film still on YouTube plays in YouTube's player,
// and our own controls step aside (only Previous, Next and Full Screen stay).
// A film that needs the Kino's password: the Worker answers "password", and
// the password box opens on the screen; OK runs the check at the door with
// the password, and the film starts.
//
// Like every page script (docs/DESKTOP.md): it starts once per window, finds
// everything from its root, only answers keys while its window is in front,
// and cleans up when the window closes or moves on to another page.
import type Hls from 'hls.js';
import { clock } from '../../lib/kino';
import { desktop, h, message, setAttr, setText, tr, type Bi } from '../paint/dom';
import { getTicket, SAY } from './ticket';

type Play =
  | { kind: 'hls'; src: string; poster: string; width: number; height: number; exp: number }
  | { kind: 'youtube'; id: string };

interface MenuSpec { label?: string; zh?: string; icon?: string; sep?: boolean; disabled?: boolean; checked?: boolean; radio?: boolean; key?: string; sub?: MenuSpec[]; action?: () => void }
type Kus98 = { menus?(el: Element, provider: (name: string) => MenuSpec[] | null): void; open(url: string): Promise<void>; close(el: Element): void };

const S: Record<string, Bi> = {
  ready: { en: 'Ready', zh: '就绪' },
  ticket: { en: 'Getting a ticket…', zh: '正在取票……' },
  password: { en: 'Waiting for the password', zh: '等待输入密码' },
  opening: { en: 'Opening…', zh: '正在打开……' },
  playing: { en: 'Playing', zh: '正在播放' },
  paused: { en: 'Paused', zh: '已暂停' },
  stopped: { en: 'Stopped', zh: '已停止' },
  buffering: { en: 'Buffering…', zh: '正在缓冲……' },
  finished: { en: 'Finished', zh: '已结束' },
  youtube: { en: 'Playing in YouTube’s player', zh: '在 YouTube 播放器中播放' },
};
const NOTE: Record<string, Bi> = {
  ...SAY,
  failed: { en: 'The film could not be opened. Press Play to try again in a moment.', zh: '无法打开这部影片。请稍后按“播放”重试。' },
  door: SAY.failed,
  unsupported: { en: 'This browser can’t play the film. Please try another browser.', zh: '这个浏览器无法播放这部影片。请换一个浏览器试试。' },
};

export class KinoPlayer {
  private readonly win: HTMLElement;
  private readonly ac = new AbortController();
  private readonly film: string;
  private readonly seconds: number;
  private readonly screen: HTMLElement;
  private readonly poster: HTMLElement | null;
  private readonly start: HTMLElement;
  private readonly bigPlay: HTMLButtonElement;
  private readonly check: HTMLElement;
  private readonly msg: HTMLElement;
  private readonly pw: HTMLFormElement | null;
  private readonly seek: HTMLInputElement;
  private readonly volume: HTMLInputElement;
  private readonly time: HTMLElement;
  private readonly lcd: HTMLElement;
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
    this.screen = q('[data-kino-screen]');
    this.poster = root.querySelector('[data-kino-poster]');
    this.start = q('[data-kino-start]');
    this.bigPlay = q('[data-kino-bigplay]');
    this.check = q('[data-kino-check]');
    this.msg = q('[data-kino-msg]');
    this.pw = root.querySelector('[data-kino-pw]');
    this.seek = q('[data-kino-seek]');
    this.volume = q('[data-kino-volume]');
    this.time = q('[data-kino-time]');
    this.lcd = q('[data-kino-lcdstate]');
    this.quality = q('[data-kino-quality]');
    this.fields = [...this.win.querySelectorAll<HTMLElement>(':scope > [data-window-inner] > .status-bar > .status-bar-field')];
    this.bind();
  }

  // ---- Wiring ----

  private bind() {
    const signal = this.ac.signal;
    this.root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-kino-cmd]');
      if (b && this.root.contains(b) && !(b as HTMLButtonElement).disabled) this.run(b.dataset.kinoCmd!);
    }, { signal });
    this.seek.addEventListener('input', () => {
      const v = this.video;
      if (!v || !Number.isFinite(v.duration)) return;
      this.seeking = true;
      v.currentTime = (Number(this.seek.value) / 1000) * v.duration;
      this.showTime();
    }, { signal });
    this.seek.addEventListener('change', () => (this.seeking = false), { signal });
    this.volume.addEventListener('input', () => this.setVolume(Number(this.volume.value) / 100), { signal });
    this.quality.addEventListener('change', () => this.pick(Number(this.quality.value)), { signal });
    // A double-click on the picture: Full Screen, as media players do.
    this.screen.addEventListener('dblclick', (e) => {
      if (!(e.target as Element).closest('button, .kino-check, .kino-pw')) this.fullScreen();
    }, { signal });
    document.addEventListener('keydown', (e) => this.key(e), { signal });
    document.addEventListener('fullscreenchange', () => this.root.classList.toggle('is-full', document.fullscreenElement === this.root), { signal });
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
    if (document.fullscreenElement === this.root) void document.exitFullscreen().catch(() => {});
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
          if (this.kind === 'youtube') return false;
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
        else void this.begin();
        break;
      case 'toggle':
        if (!v) void this.begin();
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

  private async begin() {
    if (this.starting || this.kind) return;
    this.starting = true;
    this.bigPlay.hidden = true;
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

  /** Where the film plays from; a ticket first when there is none (with the password, for a film that needs it). */
  private async where(): Promise<Play | null> {
    let ticket = false;
    for (let i = 0; i < 3; i++) {
      this.status(S.opening);
      let res: Response;
      try {
        res = await fetch(`/kino/${this.film}/play`, { headers: { accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store' });
      } catch {
        this.fail(NOTE.failed);
        return null;
      }
      if (res.ok) return (await res.json()) as Play;
      const err = res.status === 401 ? (((await res.json().catch(() => ({}))) as { error?: string }).error ?? '') : '';
      if (err === 'password' && i < 2) {
        if (!(await this.askPassword())) return null;
        continue;
      }
      if (res.status === 401 && !ticket) {
        ticket = true;
        this.status(S.ticket);
        const t = await getTicket({ sitekey: this.root.dataset.sitekey, box: this.check, say: (b) => this.say(b) });
        if (t !== 'ok') {
          this.fail(t === 'failed' ? NOTE.door : NOTE[t]);
          return null;
        }
        this.say(null);
        continue;
      }
      this.fail(res.status === 503 ? NOTE.closed : NOTE.failed);
      return null;
    }
    return null;
  }

  /**
   * The password box, on the screen. Resolves true once the Worker has given a
   * ticket with the password; false on Cancel, or when the check at the door
   * fails (the screen then says why). A wrong password keeps the box open.
   */
  private askPassword(): Promise<boolean> {
    const form = this.pw;
    if (!form) {
      this.fail(NOTE.failed);
      return Promise.resolve(false);
    }
    const input = form.querySelector<HTMLInputElement>('[data-kino-pw-input]')!;
    const ok = form.querySelector<HTMLButtonElement>('[data-kino-pw-ok]')!;
    const note = (which: string | null) => {
      for (const el of form.querySelectorAll<HTMLElement>('[data-kino-pw-msg]')) el.hidden = el.dataset.kinoPwMsg !== which;
    };
    this.say(null);
    this.status(S.password);
    note(null);
    form.hidden = false;
    input.focus();
    return new Promise<boolean>((resolve) => {
      const ac = new AbortController();
      const signal = ac.signal;
      const busy = (on: boolean) => {
        form.toggleAttribute('data-busy', on);
        ok.disabled = on;
        input.readOnly = on;
      };
      const done = (v: boolean) => {
        ac.abort();
        busy(false);
        input.value = '';
        form.hidden = true;
        resolve(v);
      };
      const cancel = () => {
        if (form.hasAttribute('data-busy')) return;
        done(false);
        this.status(S.ready);
        this.bigPlay.hidden = false;
        this.bigPlay.focus();
      };
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (form.hasAttribute('data-busy')) return;
        const given = input.value;
        if (!given.trim()) return input.focus();
        busy(true);
        note(null);
        this.status(S.ticket);
        const t = await getTicket({ sitekey: this.root.dataset.sitekey, box: this.check, say: (b) => this.say(b), password: given });
        busy(false);
        if (this.dead || signal.aborted) return;
        if (t === 'ok') {
          this.say(null);
          return done(true);
        }
        if (t === 'password' || t === 'busy') {
          this.say(null);
          this.status(S.password);
          note(t === 'busy' ? 'wait' : 'wrong');
          input.select();
          input.focus();
          return;
        }
        done(false);
        this.fail(t === 'failed' ? NOTE.door : NOTE[t]);
      }, { signal });
      form.querySelector('[data-kino-pw-cancel]')!.addEventListener('click', cancel, { signal });
      form.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cancel();
        }
      }, { signal });
      // The window closes while the box is open.
      this.ac.signal.addEventListener('abort', () => done(false), { signal });
    });
  }

  private youtube(id: string) {
    this.kind = 'youtube';
    const lang = document.documentElement.dataset.lang === 'zh' ? 'zh-Hans' : 'en';
    this.frame = h('iframe', {
      class: 'kino-yt',
      src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&hl=${lang}`,
      title: { en: this.root.dataset.kinoTitleEn ?? 'Film', zh: this.root.dataset.kinoTitleZh ?? '影片' },
      allow: 'autoplay; fullscreen; picture-in-picture; encrypted-media',
      allowfullscreen: true,
      referrerpolicy: 'strict-origin-when-cross-origin',
    });
    this.start.hidden = true;
    if (this.poster) this.poster.hidden = true;
    this.screen.append(this.frame);
    // YouTube's player has its own controls: ours step aside (CSS hides .kino-own).
    this.root.classList.add('is-youtube');
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
    this.video = v;
    this.kind = 'hls';
    this.watch(v);
    this.screen.append(v);
    this.root.classList.add('is-playing');
    this.enable();

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
    void v.play().catch(() => {
      // Autoplay refused (sound, a phone's power saving): Play brings it back.
      this.status(S.paused);
      this.bigPlay.hidden = false;
      this.start.hidden = false;
    });
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
    on('playing', () => {
      // The film is on the screen: the poster and Play step aside.
      this.start.hidden = true;
      if (this.poster) this.poster.hidden = true;
      this.status(S.playing);
    });
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
    const opts = hls.levels.map((l, i) => ({ i, height: l.height })).sort((a, b) => b.height - a.height);
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
    this.field(2, hls.autoLevelEnabled ? (now ? { en: `${now} (Auto)`, zh: `${now}（自动）` } : { en: 'Auto', zh: '自动' }) : now);
  }

  private pick(level: number) {
    if (!this.hls) return;
    this.hls.currentLevel = level;
    this.quality.value = String(level);
    this.showQuality();
  }

  /** The state, in the LCD panel and the status bar. */
  private status(b: Bi) {
    setText(this.lcd, b);
    this.field(0, b);
  }

  private field(i: number, t: string | Bi) {
    const f = this.fields[i];
    if (f) setText(f, t);
  }

  /** A line on the screen (null: none). */
  private say(b: Bi | null) {
    this.msg.hidden = !b;
    if (b) setText(this.msg, b);
  }

  private fail(b: Bi) {
    this.status(S.ready);
    if (this.kind) {
      void message({ title: { en: 'Kino', zh: 'Kino' }, text: b, icon: 'warning', owner: this.root });
      return;
    }
    this.start.hidden = false;
    this.bigPlay.hidden = false;
    this.say(b);
  }

  private enable() {
    for (const el of this.root.querySelectorAll<HTMLButtonElement | HTMLInputElement>('.kino-own[disabled]')) el.disabled = false;
  }

  private setVolume(x: number) {
    if (!this.video) return;
    this.video.volume = Math.min(1, Math.max(0, x));
    this.video.muted = this.video.volume === 0;
  }

  /** Full Screen: the whole player (picture and controls); Esc comes back. An iPhone only lets a video go full screen, in its own player. */
  private fullScreen() {
    const v = this.video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    if (this.root.requestFullscreen) void this.root.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    else v?.webkitEnterFullscreen?.();
  }

  // ---- Menus ----

  private menu(name: string): MenuSpec[] | null {
    const d = desktop() as unknown as Kus98 | undefined;
    const v = this.video;
    const on = !!v && !v.paused && !v.ended;
    const own = this.kind !== 'youtube';
    switch (name) {
      case 'file':
        return [
          { label: '&All Films', zh: '全部影片(&A)', icon: 'kino', action: () => void d?.open('/kino') },
          { sep: true },
          { label: '&Close', zh: '关闭(&C)', action: () => d?.close(this.win) },
        ];
      case 'view': {
        const items: MenuSpec[] = [{ label: '&Full Screen', zh: '全屏(&F)', key: 'F', action: () => this.fullScreen() }];
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
      case 'play': {
        const prev = this.root.querySelector<HTMLAnchorElement>('a.kino-btn[href] .ico-tb-prev')?.parentElement as HTMLAnchorElement | undefined;
        const next = this.root.querySelector<HTMLAnchorElement>('a.kino-btn[href] .ico-tb-next')?.parentElement as HTMLAnchorElement | undefined;
        return [
          { label: on ? '&Pause' : '&Play', zh: on ? '暂停(&P)' : '播放(&P)', key: 'Space', disabled: !own, action: () => this.run(v ? 'toggle' : 'play') },
          { label: '&Stop', zh: '停止(&S)', disabled: !v, action: () => this.run('stop') },
          { sep: true },
          { label: 'P&revious Film', zh: '上一部(&R)', disabled: !prev, action: () => prev && void d?.open(prev.getAttribute('href')!) },
          { label: '&Next Film', zh: '下一部(&N)', disabled: !next, action: () => next && void d?.open(next.getAttribute('href')!) },
          { sep: true },
          { label: '&Back 5 Seconds', zh: '后退 5 秒(&B)', key: '←', disabled: !v, action: () => v && (v.currentTime = Math.max(0, v.currentTime - 5)) },
          { label: '&Forward 5 Seconds', zh: '前进 5 秒(&F)', key: '→', disabled: !v, action: () => v && (v.currentTime += 5) },
          { sep: true },
          { label: '&Mute', zh: '静音(&M)', key: 'M', checked: !!v?.muted, disabled: !v, action: () => this.run('mute') },
          { label: 'Volume &Up', zh: '增大音量(&U)', key: '↑', disabled: !v, action: () => this.setVolume((v?.volume ?? 1) + 0.1) },
          { label: 'Volume &Down', zh: '减小音量(&D)', key: '↓', disabled: !v, action: () => this.setVolume((v?.volume ?? 1) - 0.1) },
        ];
      }
      case 'help':
        return kinoHelp(this.root);
      default:
        return null;
    }
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

/** Help ▸ Help Topics and About Kino (Now Showing has the same). */
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
