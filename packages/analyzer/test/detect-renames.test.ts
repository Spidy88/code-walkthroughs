import { jsTsAdapter } from '@cw/adapters';
import { describe, expect, test } from 'vitest';
import { type PriorAnalyzedNode, detectRenameCandidates } from '../src/renames/detect.ts';

describe('detectRenameCandidates', () => {
  function parse(filePath: string, content: string) {
    return jsTsAdapter.parseFile({ projectId: 'p', filePath, content });
  }

  test('pairs a removed-old with a similarly-named new node in the same file', () => {
    const filePath = 'src/orders.ts';
    const prior: PriorAnalyzedNode[] = [
      {
        nodeIdentity: `p:${filePath}:listOrders`,
        filePath,
        name: 'listOrders',
        kind: 'function',
      },
    ];
    // listOrders → listMyOrders shares {list, orders} of {list, my,
    // orders} = 2/3 overlap, well above the 0.55 default threshold.
    const current = parse(filePath, 'export async function listMyOrders() { return []; }');

    const candidates = detectRenameCandidates({
      priorNodes: prior,
      currentFiles: [current],
    });
    expect(candidates).toHaveLength(1);
    const ctx = candidates[0]?.context as {
      kind: 'rename';
      oldIdentity: string;
      newIdentity: string;
      similarity: number;
    };
    expect(ctx.kind).toBe('rename');
    expect(ctx.oldIdentity).toBe(`p:${filePath}:listOrders`);
    expect(ctx.newIdentity.endsWith(':listMyOrders')).toBe(true);
    expect(ctx.similarity).toBeGreaterThan(0.5);
  });

  test('does not emit when token overlap is below threshold (e.g. verb swap on a single noun)', () => {
    const filePath = 'src/orders.ts';
    const prior: PriorAnalyzedNode[] = [
      {
        nodeIdentity: `p:${filePath}:listOrders`,
        filePath,
        name: 'listOrders',
        kind: 'function',
      },
    ];
    // listOrders ↔ fetchOrders shares only {orders}: 1/3 = 0.33 —
    // below the default 0.55 threshold. False positives here would
    // be very annoying so we err on the side of not asking.
    const current = parse(filePath, 'export async function fetchOrders() { return []; }');
    const candidates = detectRenameCandidates({ priorNodes: prior, currentFiles: [current] });
    expect(candidates).toHaveLength(0);
  });

  test('does not pair across files', () => {
    const prior: PriorAnalyzedNode[] = [
      {
        nodeIdentity: 'p:src/a.ts:doStuff',
        filePath: 'src/a.ts',
        name: 'doStuff',
        kind: 'function',
      },
    ];
    // Same name reappears in a different file — not a rename.
    const current = parse('src/b.ts', 'export function doStuff() { return 1; }');
    const candidates = detectRenameCandidates({
      priorNodes: prior,
      currentFiles: [current],
    });
    expect(candidates).toHaveLength(0);
  });

  test('does not emit when the old identity is still present', () => {
    const filePath = 'src/orders.ts';
    const prior: PriorAnalyzedNode[] = [
      {
        nodeIdentity: `p:${filePath}:listOrders`,
        filePath,
        name: 'listOrders',
        kind: 'function',
      },
    ];
    // Both old and a new sibling — old is intact, no rename.
    const current = parse(
      filePath,
      `
        export async function listOrders() { return []; }
        export async function listProducts() { return []; }
      `,
    );
    const candidates = detectRenameCandidates({
      priorNodes: prior,
      currentFiles: [current],
    });
    expect(candidates).toHaveLength(0);
  });

  test('produces stable keys across calls (so answers persist via state.db)', () => {
    const filePath = 'src/orders.ts';
    const prior: PriorAnalyzedNode[] = [
      {
        nodeIdentity: `p:${filePath}:listOrders`,
        filePath,
        name: 'listOrders',
        kind: 'function',
      },
    ];
    const current = parse(filePath, 'export async function fetchOrders() { return []; }');
    const a = detectRenameCandidates({ priorNodes: prior, currentFiles: [current] });
    const b = detectRenameCandidates({ priorNodes: prior, currentFiles: [current] });
    expect(a[0]?.key).toBe(b[0]?.key);
  });
});
