import { describe, expect, it } from 'vitest';
import { evaluateShellRule } from '../src/rules/service.ts';

describe('evaluateShellRule', () => {
  it('parses a well-formed pass response', async () => {
    const result = await evaluateShellRule({
      command: `printf '%s' '{"kind":"pass","message":"ok"}'`,
      io: { whatever: 1 },
    });
    expect(result.kind).toBe('pass');
    expect(result.message).toBe('ok');
  });

  it('returns skip when stdout is empty', async () => {
    const result = await evaluateShellRule({
      command: 'true',
      io: {},
    });
    expect(result.kind).toBe('skip');
  });

  it('returns skip when shell output is unparseable JSON', async () => {
    const result = await evaluateShellRule({
      command: `printf '%s' 'not-json'`,
      io: {},
    });
    expect(result.kind).toBe('skip');
    expect(result.message).toMatch(/unparseable/);
  });

  it('honours the timeout instead of blocking the analyzer', async () => {
    const result = await evaluateShellRule({
      command: 'sleep 5',
      timeoutMs: 200,
      io: {},
    });
    expect(result.kind).toBe('skip');
    expect(result.message).toMatch(/timed out/);
  });
});
