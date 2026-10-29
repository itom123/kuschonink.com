import { handleContact, type Deps } from './contact.ts';
const good = { name: 'Ann', email: 'ann@example.com', subject: 'Hello', message: 'Line 1\nLine 2 <b>', website: '', turnstileToken: 'tok' };
const req = (body: unknown, origin = 'https://kuschonink.com', method = 'POST', ct = 'application/json') =>
  new Request('https://kuschonink.com/v1/contact/kuschonink', { method, headers: { origin, 'content-type': ct, 'cf-connecting-ip': '1.2.3.4' }, body: method === 'POST' ? JSON.stringify(body) : undefined });
const sent: any[] = [];
const deps = (o: Partial<Deps> = {}): Deps => ({
  secret: 's', verify: async () => ({ success: true, hostname: 'kuschonink.com', action: 'kuschonink-contact' }),
  send: async (m) => { sent.push(m); }, allow: async () => true, log: () => {}, ...o });
let fails = 0;
const check = async (name: string, r: Promise<Response>, status: number, error?: string) => {
  const res = await r; const b = res.status === 204 ? {} : await res.json();
  const ok = res.status === status && (error === undefined || b.error === error);
  if (!ok) fails++; console.log(ok ? 'PASS' : 'FAIL', name, res.status, JSON.stringify(b));
};
await check('valid message is sent', handleContact(req(good), deps()), 202);
console.log('   email:', JSON.stringify({ from: sent[0].from, replyTo: sent[0].replyTo, subject: sent[0].subject, hasTo: 'to' in sent[0], headers: 'headers' in sent[0], htmlEscaped: sent[0].html.includes('&lt;b&gt;') }));
await check('preflight', handleContact(req(null, 'https://kuschonink.com', 'OPTIONS'), deps()), 204);
await check('other origin rejected', handleContact(req(good, 'https://evil.example'), deps()), 403, 'origin_not_allowed');
await check('missing secret', handleContact(req(good), deps({ secret: undefined })), 503, 'service_not_configured');
await check('spam trap', handleContact(req({ ...good, website: 'x' }), deps({ send: async () => { throw new Error('should not send'); } })), 202);
await check('missing field', handleContact(req({ ...good, subject: '' }), deps()), 400, 'missing_required_field');
await check('bad email', handleContact(req({ ...good, email: 'nope' }), deps()), 400, 'invalid_submission');
await check('newline in subject', handleContact(req({ ...good, subject: 'a\nBcc: x' }), deps()), 400, 'invalid_submission');
await check('too long', handleContact(req({ ...good, message: 'x'.repeat(4001) }), deps()), 400, 'field_too_long');
await check('rate limited', handleContact(req(good), deps({ allow: async () => false })), 429, 'rate_limited');
await check('turnstile says no', handleContact(req(good), deps({ verify: async () => ({ success: false, 'error-codes': ['invalid-input-secret'] }) })), 403, 'verification_failed');
await check('wrong hostname', handleContact(req(good), deps({ verify: async () => ({ success: true, hostname: 'evil.example', action: 'kuschonink-contact' }) })), 403, 'verification_failed');
await check('wrong action', handleContact(req(good), deps({ verify: async () => ({ success: true, hostname: 'kuschonink.com', action: 'x' }) })), 403, 'verification_failed');
await check('siteverify down', handleContact(req(good), deps({ verify: async () => { throw new Error('down'); } })), 503, 'verification_unavailable');
await check('email error code surfaced', handleContact(req(good), deps({ send: async () => { throw Object.assign(new Error('nope'), { code: 'E_SENDER_NOT_VERIFIED' }); } })), 502, 'delivery_failed');
await check('email error without code shows its message', handleContact(req(good), deps({ send: async () => { throw new Error('Sender address not allowed'); } })), 502, 'delivery_failed');
await check('not JSON', handleContact(req(good, 'https://kuschonink.com', 'POST', 'text/plain'), deps()), 415, 'unsupported_media_type');
console.log(fails ? `${fails} FAILED` : 'all passed');

import { buildMime } from './mime.ts';
const mime = buildMime({ from: { email: 'noreply@kuschonink.com', name: 'kuschonink.com' }, replyTo: 'ann@example.com', subject: 'kuschonink.com: 你好', text: 'Line 1\nLine 2 é', html: '<p>hi</p>' }, 'to@example.com', 'abc', new Date(0));
const okMime = mime.includes('From: "kuschonink.com" <noreply@kuschonink.com>\r\n') && mime.includes('To: <to@example.com>') && mime.includes('Reply-To: <ann@example.com>') && /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/.test(mime) && mime.includes('Message-ID: <abc@kuschonink.com>') && mime.endsWith('--kuschonink-abc--\r\n');
const body = Buffer.from(mime.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace(/\r\n/g, ''), 'base64').toString('utf8');
console.log(okMime && body === 'Line 1\nLine 2 é' ? 'PASS' : 'FAIL', 'raw MIME message is well formed and decodes back');
if (!(okMime && body === 'Line 1\nLine 2 é')) process.exitCode = 1;
