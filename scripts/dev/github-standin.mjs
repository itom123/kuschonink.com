// A stand-in for the few GitHub REST calls the Worker makes (refs, contents,
// blobs, trees, commits, check runs), as an in-memory repository, so tests and
// `wrangler dev` never touch the real repository. Plain Node ESM.
//
// In tests: const g = githubStandIn({ files: { 'a/b.json': '{}' } });
//           github({ token: 't', repo: 'o/r', fetch: g.fetch, base: g.base })
// g.files() reads main's files; g.checks.set(sha, [...]) sets a commit's checks;
// g.moveMain() makes a commit "someone else" pushed meanwhile.
import { createHash } from 'node:crypto';

const sha1 = (s) => createHash('sha1').update(s).digest('hex');

export function githubStandIn(o = {}) {
  const base = o.base ?? 'http://github.standin';
  const repo = o.repo ?? 'itom123/kuschonink.com';
  const blobs = new Map(); // sha → Uint8Array
  const trees = new Map(); // sha → Map(path → blob sha)
  const commits = new Map(); // sha → { tree, parents, message }
  const refs = new Map();
  const checks = new Map();
  const calls = [];
  let n = 0;

  const putBlob = (bytes) => {
    const sha = sha1(Buffer.concat([Buffer.from(`blob ${++n}`), Buffer.from(bytes)]));
    blobs.set(sha, bytes);
    return sha;
  };
  const putTree = (map) => {
    const sha = sha1(`tree ${++n} ${[...map].join()}`);
    trees.set(sha, map);
    return sha;
  };
  const putCommit = (tree, parents, message) => {
    const sha = sha1(`commit ${++n} ${tree} ${message}`);
    commits.set(sha, { tree, parents, message, date: new Date(Date.UTC(2026, 10, 9, 9, 0, n)).toISOString() });
    return sha;
  };
  {
    const m = new Map();
    for (const [p, v] of Object.entries(o.files ?? {})) m.set(p, putBlob(typeof v === 'string' ? new TextEncoder().encode(v) : v));
    refs.set('main', putCommit(putTree(m), [], 'initial'));
  }

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const err = (status, message) => json({ message }, status);
  const b64 = (b) => Buffer.from(b).toString('base64');
  const treeOf = (ref) => trees.get(commits.get(refs.get(ref) ?? ref)?.tree);

  async function handle(req) {
    const url = new URL(req.url);
    const p = decodeURIComponent(url.pathname);
    calls.push(`${req.method} ${p}`);
    if (req.headers.get('authorization') !== `Bearer ${o.token ?? 'gh-token'}`) return err(401, 'Bad credentials');
    const pre = `/repos/${repo}`;
    if (!p.startsWith(pre)) return err(404, 'Not Found');
    const rest = p.slice(pre.length);
    let m;
    if (req.method === 'GET' && (m = /^\/git\/ref\/heads\/(.+)$/.exec(rest))) {
      const sha = refs.get(m[1]);
      return sha ? json({ ref: `refs/heads/${m[1]}`, object: { sha, type: 'commit' } }) : err(404, 'Not Found');
    }
    if (req.method === 'GET' && (m = /^\/contents\/(.+)$/.exec(rest))) {
      const t = treeOf(url.searchParams.get('ref') ?? 'main');
      const blob = t?.get(m[1]);
      if (!blob) return err(404, 'Not Found');
      const bytes = blobs.get(blob);
      return bytes.length > 1024 * 1024 ? json({ type: 'file', sha: blob, encoding: 'none', content: '' }) : json({ type: 'file', sha: blob, encoding: 'base64', content: b64(bytes) });
    }
    if (req.method === 'GET' && (m = /^\/git\/trees\/(.+)$/.exec(rest))) {
      const t = trees.get(m[1]) ?? treeOf(m[1]);
      if (!t) return err(404, 'Not Found');
      return json({ sha: m[1], truncated: false, tree: [...t].map(([path, sha]) => ({ path, type: 'blob', sha })) });
    }
    if (req.method === 'GET' && (m = /^\/git\/blobs\/(.+)$/.exec(rest))) {
      const bytes = blobs.get(m[1]);
      return bytes ? json({ sha: m[1], encoding: 'base64', content: b64(bytes) }) : err(404, 'Not Found');
    }
    if (req.method === 'GET' && (m = /^\/git\/commits\/(.+)$/.exec(rest))) {
      const c = commits.get(m[1]);
      return c ? json({ sha: m[1], tree: { sha: c.tree }, parents: c.parents.map((sha) => ({ sha })) }) : err(404, 'Not Found');
    }
    if (req.method === 'POST' && rest === '/git/blobs') {
      const b = await req.json();
      return json({ sha: putBlob(new Uint8Array(Buffer.from(b.content, b.encoding === 'base64' ? 'base64' : 'utf8'))) }, 201);
    }
    if (req.method === 'POST' && rest === '/git/trees') {
      const b = await req.json();
      const t = new Map(trees.get(b.base_tree) ?? []);
      for (const e of b.tree) {
        if (e.sha === null) t.delete(e.path);
        else if (!blobs.has(e.sha)) return err(422, 'blob not found');
        else t.set(e.path, e.sha);
      }
      return json({ sha: putTree(t) }, 201);
    }
    if (req.method === 'POST' && rest === '/git/commits') {
      const b = await req.json();
      if (!trees.has(b.tree)) return err(422, 'tree not found');
      const sha = putCommit(b.tree, b.parents, b.message);
      return json({ sha, html_url: `https://github.com/${repo}/commit/${sha}` }, 201);
    }
    if (req.method === 'PATCH' && (m = /^\/git\/refs\/heads\/(.+)$/.exec(rest))) {
      const b = await req.json();
      const cur = refs.get(m[1]);
      if (b.force) return err(403, 'the stand-in refuses force pushes (and so does the Worker)');
      // A fast-forward: the new commit's parent must be where the branch is now.
      if (!commits.get(b.sha)?.parents.includes(cur)) return err(422, 'Update is not a fast forward');
      refs.set(m[1], b.sha);
      return json({ ref: `refs/heads/${m[1]}`, object: { sha: b.sha } });
    }
    if (req.method === 'GET' && (m = /^\/commits\/([^/]+)\/check-runs$/.exec(rest))) {
      return json({ total_count: (checks.get(m[1]) ?? []).length, check_runs: checks.get(m[1]) ?? [] });
    }
    if (req.method === 'GET' && rest === '/commits') {
      const out = [];
      let sha = refs.get('main');
      while (sha && out.length < 30) {
        const c = commits.get(sha);
        out.push({ sha, html_url: `https://github.com/${repo}/commit/${sha}`, commit: { message: c.message, committer: { date: c.date } } });
        sha = c.parents[0];
      }
      return json(out);
    }
    return err(404, `${req.method} ${rest} is not in the stand-in`);
  }

  return {
    base,
    calls,
    checks,
    fetch: (input, init) => handle(new Request(input, init)),
    /** main's files as text (or bytes with { bytes: true }). */
    files(opts = {}) {
      const t = treeOf('main');
      return Object.fromEntries([...t].map(([p, s]) => [p, opts.bytes ? blobs.get(s) : new TextDecoder().decode(blobs.get(s))]));
    },
    head: () => refs.get('main'),
    message: (sha) => commits.get(sha ?? refs.get('main'))?.message,
    /** Someone else commits to main (a file changed), so the next fast-forward from the old head fails. */
    moveMain(path = 'README.md', text = 'moved') {
      const t = new Map(treeOf('main'));
      t.set(path, putBlob(new TextEncoder().encode(text)));
      refs.set('main', putCommit(putTree(t), [refs.get('main')], 'someone else'));
    },
  };
}
