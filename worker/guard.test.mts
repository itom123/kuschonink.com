// npm test: the Guard's logic (worker/guard.ts) on a Map, with a clock the
// test moves by hand.
import { GuardCore, memoryStore } from './guard.ts';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(detail));
}

let now = Date.UTC(2026, 10, 9, 9, 0, 0);
const store = memoryStore();
const g = new GuardCore(store, () => now);

// ---- Counters ----
{
  const r: boolean[] = [];
  for (let i = 0; i < 4; i++) r.push((await g.hit('suggest:1.2.3.4', 3, 3600)).ok);
  check('hit: three allowed, the fourth refused', r.join() === 'true,true,true,false', r);
  check('hit: another key counts apart', (await g.hit('suggest:5.6.7.8', 3, 3600)).ok);
  now += 3600 * 1000;
  check('hit: a new window starts afresh', (await g.hit('suggest:1.2.3.4', 3, 3600)).count === 1);
}

// ---- Claims ----
{
  const a = await g.claim('idem:abc', 600);
  const b = await g.claim('idem:abc', 600);
  check('claim: the first is fresh, the second sees "pending"', a.fresh && !b.fresh && b.value === 'pending', { a, b });
  await g.settle('idem:abc', 'S-7F3K', 600);
  check('settle: later claims see the reference', (await g.claim('idem:abc', 600)).value === 'S-7F3K');
  await g.release('idem:abc');
  check('release: a retry may run', (await g.claim('idem:abc', 600)).fresh);
  now += 601 * 1000;
  check('claim: free again once it expires', (await g.claim('idem:abc', 600)).fresh);
  let threw = false;
  try { await g.claim('bad key with spaces', 10); } catch { threw = true; }
  check('claim: odd keys are refused', threw);
}

// ---- Sessions ----
{
  const s = await g.sessionCreate(12 * 3600);
  check('session: a 43-character random id', /^[A-Za-z0-9_-]{43}$/.test(s.id));
  check('session: only its hash is stored', ![...store.map.keys()].some((k) => k.includes(s.id)));
  check('session: valid', (await g.sessionCheck(s.id)).ok);
  check('session: a made-up id is not', !(await g.sessionCheck('A'.repeat(43))).ok && !(await g.sessionCheck('short')).ok);
  const t = await g.sessionCreate(12 * 3600);
  await g.sessionEnd(s.id);
  check('session: Log Off ends that one only', !(await g.sessionCheck(s.id)).ok && (await g.sessionCheck(t.id)).ok);
  const u = await g.sessionCreate(12 * 3600);
  await g.sessionEndAll();
  check('session: Log Off Everywhere ends them all', !(await g.sessionCheck(t.id)).ok && !(await g.sessionCheck(u.id)).ok);
  const v = await g.sessionCreate(60);
  now += 61 * 1000;
  check('session: expires', !(await g.sessionCheck(v.id)).ok);
  check('session: new ones work after Log Off Everywhere', (await g.sessionCheck((await g.sessionCreate(60)).id)).ok);
}

// ---- Sweep ----
{
  now += 400 * 86400 * 1000;
  const before = store.map.size;
  const gone = await g.sweep();
  check('sweep: expired counters, claims and sessions go', gone > 0 && store.map.size === before - gone && [...store.map.keys()].every((k) => k === 'g'), [...store.map.keys()]);
}

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
