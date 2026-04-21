import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeTime(time: number, length = 10): string {
  let out = '';
  let value = time;
  for (let i = length - 1; i >= 0; i -= 1) {
    const mod = value % 32;
    out = CROCKFORD[mod] + out;
    value = (value - mod) / 32;
  }
  return out;
}

function encodeRandom(length = 16): string {
  const bytes = randomBytes(length);
  let out = '';
  for (const byte of bytes) {
    out += CROCKFORD[byte % 32];
  }
  return out;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}
