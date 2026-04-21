import { describe, expect, test } from 'vitest';
import { setStatusInputSchema } from '../src/schemas/review.ts';

describe('setStatusInputSchema', () => {
  test('accepts approve without a comment', () => {
    const result = setStatusInputSchema.safeParse({
      nodeIdentity: 'project:file.ts:foo',
      status: 'approved',
    });
    expect(result.success).toBe(true);
  });

  test('accepts reject with a comment', () => {
    const result = setStatusInputSchema.safeParse({
      nodeIdentity: 'project:file.ts:foo',
      status: 'rejected',
      comment: 'needs validation',
    });
    expect(result.success).toBe(true);
  });

  test('rejects info_requested without a comment', () => {
    const result = setStatusInputSchema.safeParse({
      nodeIdentity: 'project:file.ts:foo',
      status: 'info_requested',
    });
    expect(result.success).toBe(false);
  });

  test('accepts info_requested with a comment', () => {
    const result = setStatusInputSchema.safeParse({
      nodeIdentity: 'project:file.ts:foo',
      status: 'info_requested',
      comment: 'what is this for?',
    });
    expect(result.success).toBe(true);
  });

  test('accepts optional pathScope', () => {
    const result = setStatusInputSchema.safeParse({
      nodeIdentity: 'project:file.ts:foo',
      status: 'approved',
      pathScope: 'path-123',
    });
    expect(result.success).toBe(true);
  });
});
