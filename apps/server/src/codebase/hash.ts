import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

export function hashCodebasePath(absolutePath: string): string {
  const normalized = resolve(absolutePath);
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
