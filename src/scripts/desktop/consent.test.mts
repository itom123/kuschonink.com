// npm test: the visitor's choice about cookies and storage (src/scripts/desktop/consent.ts).
import { clearFor, createConsent, keepAgain, KEY, keysToClear, levelAllows, ownKey, PAINT_DB, parseChoice, SESSION_COOKIE, type Env, type Kind, type Level, type StorageLike } from './consent.ts';

let fails = 0;
const ok = (cond: boolean, name: string, extra = '') => {
  if (!cond) fails++;
  console.log(cond ? 'PASS' : 'FAIL', name, extra);
};

/** localStorage or sessionStorage, in memory. */
class Store implements StorageLike {
  m = new Map<string, string>();
  constructor(init: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(init)) this.m.set(k, v);
  }
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()].sort().join(','); }
}

/** Storage that throws at every turn, as when the browser blocks site data. */
class Blocked implements StorageLike {
  get length(): number { throw new Error('SecurityError'); }
  key(): string | null { throw new Error('SecurityError'); }
  getItem(): string | null { throw new Error('SecurityError'); }
  setItem(): void { throw new Error('QuotaExceededError'); }
  removeItem(): void { throw new Error('SecurityError'); }
}

const NOW = 1_762_000_000_000;
function fake(local: StorageLike | null, session: StorageLike | null = new Store(), secure = true) {
  const cookies: string[] = [];
  const dropped: string[] = [];
  let other: ((raw: string | null) => void) | undefined;
  const env: Env = {
    local,
    session,
    setCookie: (c) => void cookies.push(c),
    dropDb: (n) => void dropped.push(n),
    secure,
    now: () => NOW,
    watch: (f) => (other = f),
  };
  return { env, cookies, dropped, otherTab: (raw: string | null) => other?.(raw) };
}
const choice = (level: string, at: unknown = 1) => JSON.stringify({ v: 1, level, at });
const KINDS: Kind[] = ['cookie', 'tab', 'lasting'];
const allows = (level: Level | null) => KINDS.map((k) => (levelAllows(level, k) ? k : '-')).join(' ');

// ---- What each level allows ----
ok(allows('all') === 'cookie tab lasting', 'Allow All: cookies, this tab and lasting storage', allows('all'));
ok(allows('necessary') === 'cookie tab -', 'Necessary Only: cookies and this tab, nothing lasting', allows('necessary'));
ok(allows('none') === '- - -', 'None: nothing', allows('none'));
ok(allows(null) === '- - -', 'not decided yet: nothing', allows(null));

// ---- Reading a stored choice ----
ok(parseChoice(choice('necessary', 5))?.level === 'necessary', 'a stored choice is read');
ok(parseChoice(JSON.stringify({ v: 1, level: 'all', at: 7, extra: true }))?.at === 7, 'extra fields do no harm');
const bad: [string, string | null | undefined][] = [
  ['nothing', null],
  ['undefined', undefined],
  ['empty', ''],
  ['not JSON', 'Allow All'],
  ['cut short', '{"v":1,"level":"all"'],
  ['another version', JSON.stringify({ v: 2, level: 'all', at: 1 })],
  ['no version', JSON.stringify({ level: 'all', at: 1 })],
  ['an unknown level', choice('maybe')],
  ['a level in capitals', choice('All')],
  ['no date', JSON.stringify({ v: 1, level: 'all' })],
  ['a date that is text', choice('all', 'today')],
  ['a date that is not finite', '{"v":1,"level":"all","at":1e999}'],
  ['a bare string', '"all"'],
  ['an array', '["all"]'],
  ['null', 'null'],
  ['a number', '1'],
];
for (const [what, raw] of bad) ok(parseChoice(raw) === null, `a bad stored value (${what}) counts as no choice`);

// ---- Which keys are the site's, and which go ----
ok(ownKey('kus98:settings') && ownKey('kus98:guide:view') && ownKey('lang'), "the site's own keys: kus98:… and lang");
ok(!ownKey('kus98') && !ownKey('xkus98:a') && !ownKey('language') && !ownKey('other-app:lang') && !ownKey('Lang'), 'other keys on the origin are not the site’s');
const keys = ['kus98:settings', KEY, 'lang', 'kus98:desk', 'other:thing', 'language', 'kus98'];
ok(keysToClear(keys, 'local', 'all').length === 0, 'Allow All clears nothing');
ok(keysToClear(keys, 'local', 'necessary').join(',') === 'kus98:settings,lang,kus98:desk', 'Necessary Only clears the site’s lasting keys, not the choice, nor other keys', keysToClear(keys, 'local', 'necessary').join(','));
ok(keysToClear(keys, 'session', 'necessary').length === 0, 'Necessary Only keeps this tab’s memory');
ok(keysToClear(keys, 'session', 'none').join(',') === 'kus98:settings,lang,kus98:desk', 'None clears this tab’s memory too');

// ---- Before any choice ----
{
  const f = fake(new Store());
  const c = createConsent(f.env);
  ok(c.level() === null && !c.decided(), 'nothing stored: no choice yet');
  ok(KINDS.every((k) => !c.allows(k)), 'no choice yet: nothing is allowed');
}
{
  const f = fake(new Store({ [KEY]: '{"v":1,"level":"sure"}', 'kus98:settings': '{"sound":false}' }));
  const c = createConsent(f.env);
  ok(c.level() === null, 'a bad stored choice: asked again');
  ok(f.env.local!.getItem('kus98:settings') !== null, '… and nothing is cleared before a choice');
}

// ---- Choosing ----
const site = () => ({
  [KEY]: choice('all'),
  'kus98:settings': '{"scheme":"slate"}',
  'kus98:user': '"Tom"',
  'kus98:guide': '{"heat":false}',
  lang: 'zh',
  'other-app:token': 'keep me',
  language: 'keep me too',
});
const tab = () => ({ 'kus98:desk': '{"v":1}', 'kus98:draft': '{"message":"hi"}', 'kus98:guide:view': '{}', 'other-app:tab': 'keep me' });
{
  const local = new Store(site());
  const session = new Store(tab());
  const f = fake(local, session);
  const c = createConsent(f.env);
  ok(c.level() === 'all' && c.allows('lasting'), 'Allow All stored: everything allowed');
  const heard: string[] = [];
  const stop = c.on((l, was) => heard.push(`${was}→${l}`));

  c.set('necessary');
  const saved = parseChoice(local.getItem(KEY));
  ok(saved?.level === 'necessary' && saved.at === NOW, 'the choice is written, with its date', local.getItem(KEY) ?? '');
  ok(local.keys() === ['kus98:consent', 'language', 'other-app:token'].sort().join(','), 'Necessary Only: the site’s lasting keys go, the choice and other keys stay', local.keys());
  ok(session.keys() === Object.keys(tab()).sort().join(','), '… this tab’s memory stays', session.keys());
  ok(f.cookies.length === 0, '… the log-on cookie stays');
  ok(f.dropped.join() === PAINT_DB, '… Paint’s picture goes', f.dropped.join());
  ok(c.allows('cookie') && c.allows('tab') && !c.allows('lasting'), '… and allows() follows at once');
  ok(heard.join() === 'all→necessary', 'listeners hear of it', heard.join());

  c.set('none');
  ok(session.keys() === 'other-app:tab', 'None: this tab’s memory goes, other keys stay', session.keys());
  ok(f.cookies.length === 1 && f.cookies[0].startsWith(`${SESSION_COOKIE}=;`) && f.cookies[0].includes('max-age=0') && f.cookies[0].includes('path=/') && f.cookies[0].endsWith('; Secure'), '… the log-on cookie is cleared (Secure on https)', f.cookies[0]);
  ok(parseChoice(local.getItem(KEY))?.level === 'none', '… and None is written too: the choice itself always is');

  local.setItem('kus98:settings', '{}');
  session.setItem('kus98:desk', '{}');
  const cookiesBefore = f.cookies.length;
  c.set('all');
  ok(local.getItem('kus98:settings') !== null && session.getItem('kus98:desk') !== null && f.cookies.length === cookiesBefore, 'Allow All after None clears nothing');
  ok(heard.join() === 'all→necessary,necessary→none,none→all', 'listeners hear each change', heard.join());

  stop();
  c.set('necessary');
  ok(heard.length === 3, 'a listener that stopped hears no more');
}
{
  const f = fake(new Store(), new Store(), false);
  createConsent(f.env).set('none');
  ok(f.cookies.length === 1 && !f.cookies[0].includes('Secure'), 'on http (wrangler dev) the cookie is cleared without Secure', f.cookies[0]);
}
{
  const local = new Store({ 'kus98:settings': '{}', lang: 'en' });
  clearFor('necessary', fake(local).env, { cookie: false, db: false });
  ok(local.length === 0, 'clearFor() on its own clears what the level doesn’t allow');
}

// ---- Storage that fails ----
for (const [what, local] of [['blocked', new Blocked()], ['missing', null]] as const) {
  const f = fake(local, local === null ? null : new Blocked());
  let threw = false;
  let c: ReturnType<typeof createConsent> | undefined;
  try {
    c = createConsent(f.env);
    c.set('necessary');
  } catch {
    threw = true;
  }
  ok(!threw && c?.level() === 'necessary' && c.allows('cookie') && !c.allows('lasting'), `storage ${what}: the choice lives in memory for the page`);
  ok(c?.lasts() === false, `storage ${what}: the choice can't last (so the dialog doesn't ask on every page)`);
}
{
  ok(createConsent(fake(new Store()).env).lasts(), 'working storage: the choice lasts');
  /** Reads work, writes don't (storage full). */
  class Full extends Store {
    setItem(): void { throw new Error('QuotaExceededError'); }
  }
  const c = createConsent(fake(new Full()).env);
  ok(c.lasts(), 'full storage: thought to last until a write fails');
  c.set('all');
  ok(!c.lasts() && c.level() === 'all', '… then the choice lives in memory, for the page');
}

// ---- At load: leftovers the choice doesn't allow ----
{
  const local = new Store({ [KEY]: choice('necessary'), 'kus98:settings': '{}', lang: 'zh', 'other-app:x': '1' });
  const session = new Store({ 'kus98:desk': '{}' });
  const f = fake(local, session);
  createConsent(f.env);
  ok(local.keys() === 'kus98:consent,other-app:x', 'Necessary Only stored: lasting leftovers go at load', local.keys());
  ok(session.length === 1 && f.cookies.length === 0 && f.dropped.length === 0, '… this tab’s memory stays, and neither the cookie nor Paint’s database is touched');
}
{
  const session = new Store({ 'kus98:desk': '{}', 'kus98:begun': '1' });
  const f = fake(new Store({ [KEY]: choice('none') }), session);
  createConsent(f.env);
  ok(session.length === 0, 'None stored: this tab’s leftovers go at load');
}

// ---- Another tab ----
{
  const local = new Store({ [KEY]: choice('all') });
  const session = new Store(tab());
  const f = fake(local, session);
  const c = createConsent(f.env);
  const heard: string[] = [];
  c.on((l, was) => heard.push(`${was}→${l}`));
  f.otherTab(choice('none', 2));
  ok(c.level() === 'none' && session.keys() === 'other-app:tab' && f.cookies.length === 1, 'None chosen in another tab: this one follows and clears its own tab’s memory', session.keys());
  f.otherTab(choice('none', 3));
  ok(heard.join() === 'all→none', 'the same level again changes nothing', heard.join());
  f.otherTab(null);
  ok(c.level() === null && heard.join() === 'all→none,none→null', 'the choice removed in another tab: no choice here either');
}

// ---- Where the choice was made, and keeping again what the page shows ----
{
  const f = fake(new Store({ [KEY]: choice('all') }));
  const c = createConsent(f.env);
  const heard: string[] = [];
  c.on((l, was, here) => heard.push(`${was}→${l} ${here ? 'here' : 'there'}`));
  c.set('none');
  f.otherTab(choice('necessary', 2));
  c.set('all');
  ok(heard.join() === 'all→none here,none→necessary there,necessary→all here', 'listeners hear whether the choice was made in this page or another tab', heard.join());
}
ok(keepAgain('all', 'none', true) && keepAgain('all', 'necessary', true) && keepAgain('all', null, true), 'Allow All chosen here after a choice that kept nothing lasting: what the page shows is kept again');
ok(!keepAgain('all', 'all', true), '… not for Allow All chosen again (another tab may have changed things since)');
ok(!keepAgain('all', 'none', false) && !keepAgain('all', 'necessary', false), '… not in another tab, whose copy may be older');
ok(!keepAgain('necessary', 'none', true) && !keepAgain('none', 'all', true) && !keepAgain(null, 'all', true), '… and not for a choice that keeps nothing lasting');

console.log(fails ? `\n${fails} failed` : '\nall passed');
// Node runs this file (npm test); the site's type check knows only the browser.
const node = (globalThis as { process?: { exitCode?: number } }).process;
if (fails && node) node.exitCode = 1;
