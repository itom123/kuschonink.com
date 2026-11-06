// One id per build. Pages carry it in <meta name="kus98-build">; when the
// desktop opens a page from a newer build it reloads instead of mixing code.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
export const BUILD_ID: string = (env.WORKERS_CI_COMMIT_SHA ?? '').slice(0, 12) || Date.now().toString(36);
