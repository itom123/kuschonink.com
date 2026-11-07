// npm test: authenticator codes (worker/totp.ts) against RFC 6238's own test
// values (SHA-1, the ASCII secret "12345678901234567890").
import { base32Decode, base32Encode, checkTotp, hotp, otpauthUri, stepAt } from './totp.ts';

let fails = 0;
function check(name: string, ok: boolean, detail: unknown = '') {
  if (!ok) fails++;
  console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : JSON.stringify(detail));
}

const ascii = new TextEncoder().encode('12345678901234567890');
const secret = base32Encode(ascii);
check('base32 round trip', secret === 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' && base32Decode(secret)!.every((b, i) => b === ascii[i]), secret);
check('base32 ignores case, spaces, dashes and padding', base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq==')!.length === 20);
check('base32 refuses other letters', base32Decode('GEZ1') === null && base32Decode('') === null);

const rfc: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];
for (const [t, want] of rfc) {
  const got = await hotp(ascii, Math.floor(t / 30), 8);
  check(`RFC 6238 at T=${t}`, got === want, { got, want });
}

const at = (s: number) => s * 1000;
check('the current code gives its step', (await checkTotp(secret, '287082', at(59))) === 1);
check('the previous step is still accepted (a slow clock)', (await checkTotp(secret, (await hotp(ascii, 0)), at(59))) === 0);
check('two steps away is refused', (await checkTotp(secret, (await hotp(ascii, 3)), at(59))) === null);
check('spaces in the code are fine', (await checkTotp(secret, '287 082', at(59))) === 1);
check('not six digits is refused', (await checkTotp(secret, '28708', at(59))) === null && (await checkTotp(secret, 'abcdef', at(59))) === null);
check('a short secret counts as not set', (await checkTotp('GEZDGNBV', '287082', at(59))) === null);
check('stepAt', stepAt(at(59)) === 1 && stepAt(at(60)) === 2);
check('otpauth link', otpauthUri(secret).startsWith('otpauth://totp/Xiangyin%2098:Administrator?secret=GEZDGNBV') && otpauthUri(secret).includes('period=30'));

console.log(fails ? `${fails} FAILED` : 'all passed');
if (fails) process.exitCode = 1;
