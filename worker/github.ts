// A small GitHub REST client for the publisher and the admin's edits: read a
// file on main, and make one commit of several files that only moves main
// forward (a fast-forward, never a force push). `fetch` and the base URL are
// passed in, so tests use scripts/dev/github-standin.mjs.
//
// The token is a fine-grained one for this repository only, with Contents
// read and write (GITHUB_TOKEN, a Cloudflare secret). Such tokens can't read
// check runs, so checks() goes without it (the repository is public).

export const GITHUB_API = 'https://api.github.com';

export interface GitHubDeps {
  token: string;
  /** "owner/name". */
  repo: string;
  fetch: typeof fetch;
  base?: string;
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`GitHub ${status}: ${message}`);
    this.status = status;
  }
}

/** One file of a commit: new text or bytes, or `null` to delete it. */
export interface Change { path: string; content: string | Uint8Array | null }
export interface FileAt { text: string; bytes: Uint8Array; sha: string }
export interface CheckRun { name: string; status: string; conclusion: string | null; title: string; summary: string; url: string }

const b64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));

export function github(deps: GitHubDeps) {
  const base = (deps.base || GITHUB_API).replace(/\/+$/, '');
  const repo = `/repos/${deps.repo}`;

  async function call<T>(method: string, path: string, body?: unknown, ok404 = false, anonymous = false): Promise<T | null> {
    const res = await deps.fetch(`${base}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        ...(anonymous ? {} : { authorization: `Bearer ${deps.token}` }),
        'x-github-api-version': '2022-11-28',
        'user-agent': 'kuschonink-worker',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404 && ok404) return null;
    if (!res.ok) {
      let message = res.statusText;
      try { message = ((await res.json()) as { message?: string }).message ?? message; } catch { /* not JSON */ }
      throw new GitHubError(res.status, message);
    }
    return res.status === 204 ? (null as T) : ((await res.json()) as T);
  }

  const api = {
    /** The commit a branch points at. */
    async head(branch = 'main'): Promise<string> {
      const r = await call<{ object: { sha: string } }>('GET', `${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
      return r!.object.sha;
    },

    /** Every file's path at a commit (or branch). */
    async tree(ref = 'main'): Promise<string[]> {
      const r = await call<{ tree: { path: string; type: string }[]; truncated?: boolean }>('GET', `${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
      if (r?.truncated) throw new GitHubError(507, 'the repository is too big to list');
      return (r?.tree ?? []).filter((e) => e.type === 'blob').map((e) => e.path);
    },

    /** A file at a commit (or branch), or null when it isn't there. */
    async file(path: string, ref = 'main'): Promise<FileAt | null> {
      const r = await call<{ type: string; content?: string; encoding?: string; sha: string }>('GET', `${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, undefined, true);
      if (!r) return null;
      if (r.type !== 'file') throw new GitHubError(400, `${path} is not a file`);
      let bytes: Uint8Array;
      if (r.encoding === 'base64' && r.content !== undefined) bytes = unb64(r.content);
      else {
        // Over 1 MB the contents API leaves the content out: read the blob.
        const blob = await call<{ content: string }>('GET', `${repo}/git/blobs/${r.sha}`);
        bytes = unb64(blob!.content);
      }
      return { bytes, text: new TextDecoder().decode(bytes), sha: r.sha };
    },

    /**
     * One commit with these changes on top of `parent`, then move the branch to
     * it only if the branch is still at `parent` (no force). Returns the new
     * commit, or null when the branch moved meanwhile (the caller starts again).
     */
    async commit(branch: string, parent: string, message: string, changes: Change[]): Promise<{ sha: string; url: string } | null> {
      const pc = await call<{ tree: { sha: string } }>('GET', `${repo}/git/commits/${parent}`);
      const tree = [];
      for (const ch of changes) {
        if (!/^[A-Za-z0-9._@/-]+$/.test(ch.path) || ch.path.split('/').some((s) => s === '..' || s === '' || s === '.')) throw new GitHubError(400, `bad path ${ch.path}`);
        if (ch.content === null) tree.push({ path: ch.path, mode: '100644', type: 'blob', sha: null });
        else {
          const bytes = typeof ch.content === 'string' ? new TextEncoder().encode(ch.content) : ch.content;
          const blob = await call<{ sha: string }>('POST', `${repo}/git/blobs`, { content: b64(bytes), encoding: 'base64' });
          tree.push({ path: ch.path, mode: '100644', type: 'blob', sha: blob!.sha });
        }
      }
      const t = await call<{ sha: string }>('POST', `${repo}/git/trees`, { base_tree: pc!.tree.sha, tree });
      const c = await call<{ sha: string; html_url: string }>('POST', `${repo}/git/commits`, { message, tree: t!.sha, parents: [parent] });
      try {
        await call('PATCH', `${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { sha: c!.sha, force: false });
      } catch (e) {
        if (e instanceof GitHubError && (e.status === 422 || e.status === 409)) return null; // not a fast-forward any more
        throw e;
      }
      return { sha: c!.sha, url: c!.html_url };
    },

    /**
     * The checks on a commit (Workers Builds reports as one), read without the
     * token: fine-grained tokens can't read check runs, and the repository is
     * public. GitHub allows only 60 calls an hour per address without a token,
     * and Workers share their addresses, so this often fails: callers take a
     * failure as "not known yet".
     */
    async checks(sha: string): Promise<CheckRun[]> {
      const r = await call<{ check_runs: { name: string; status: string; conclusion: string | null; html_url: string; output?: { title?: string; summary?: string } }[] }>('GET', `${repo}/commits/${sha}/check-runs?per_page=50`, undefined, false, true);
      return (r?.check_runs ?? []).map((x) => ({ name: x.name, status: x.status, conclusion: x.conclusion, title: x.output?.title ?? '', summary: x.output?.summary ?? '', url: x.html_url }));
    },

    /** The newest commits on a branch (the admin's Changes window). */
    async recent(n = 15, branch = 'main'): Promise<{ sha: string; message: string; date: string; url: string }[]> {
      const r = await call<{ sha: string; html_url: string; commit: { message: string; committer: { date: string } } }[]>('GET', `${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${n}`);
      return (r ?? []).map((x) => ({ sha: x.sha, message: x.commit.message, date: x.commit.committer.date, url: x.html_url }));
    },

    /**
     * How `head` stands to `base` (commit ids, short ones too): "identical",
     * "ahead" (head has base and more), "behind" or "diverged", with the
     * commits head has that base hasn't (up to 100). null when GitHub doesn't
     * know one of them.
     */
    async compare(base: string, head: string): Promise<{ status: string; ahead: Set<string> } | null> {
      if (![base, head].every((x) => /^[0-9a-f]{7,40}$/.test(x))) throw new GitHubError(400, 'compare takes commit ids');
      const r = await call<{ status: string; commits?: { sha: string }[] }>('GET', `${repo}/compare/${base}...${head}?per_page=100`, undefined, true);
      return r ? { status: r.status, ahead: new Set((r.commits ?? []).map((c) => c.sha)) } : null;
    },

    /** Recent commits touching a path. */
    async history(path: string, n = 20): Promise<{ sha: string; message: string; date: string; url: string }[]> {
      const r = await call<{ sha: string; html_url: string; commit: { message: string; committer: { date: string } } }[]>('GET', `${repo}/commits?path=${encodeURIComponent(path)}&per_page=${n}`);
      return (r ?? []).map((x) => ({ sha: x.sha, message: x.commit.message, date: x.commit.committer.date, url: x.html_url }));
    },
  };
  return api;
}

export type GitHub = ReturnType<typeof github>;

/**
 * Read, change and commit, starting again (up to `tries` times) whenever main
 * moved in between, so a commit is always made on the newest main.
 * `build` gets a reader for files at that commit and returns the changes, or
 * null to commit nothing.
 */
export async function commitOnMain<T>(
  gh: GitHub,
  message: string,
  build: (read: (path: string) => Promise<FileAt | null>, head: string) => Promise<{ changes: Change[]; result: T; message?: string } | null>,
  tries = 4,
): Promise<{ sha: string; url: string; result: T } | null> {
  for (let i = 0; i < tries; i++) {
    const head = await gh.head('main');
    const plan = await build((p) => gh.file(p, head), head);
    if (!plan || !plan.changes.length) return null;
    const done = await gh.commit('main', head, plan.message ?? message, plan.changes);
    if (done) return { ...done, result: plan.result };
  }
  throw new GitHubError(409, 'main kept moving; try again later');
}
