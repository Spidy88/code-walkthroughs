import { describe, expect, test } from 'vitest';
import { parseJsTs } from '../src/js-ts/parse.ts';

describe('parseJsTs', () => {
  test('extracts top-level functions and exports', () => {
    const output = parseJsTs({
      projectId: 'p1',
      filePath: 'src/math.ts',
      content: `
        export function add(a: number, b: number): number {
          return a + b;
        }

        function internal(): number {
          return add(1, 2);
        }
      `,
    });

    const names = output.nodes.map((n) => n.name).sort();
    expect(names).toEqual(['add', 'internal']);
    const addNode = output.nodes.find((n) => n.name === 'add');
    expect(addNode?.exported).toBe(true);
    const internalNode = output.nodes.find((n) => n.name === 'internal');
    expect(internalNode?.exported).toBe(false);
  });

  test('extracts arrow-function components when JSX is present', () => {
    const output = parseJsTs({
      projectId: 'p1',
      filePath: 'src/Button.tsx',
      content: `
        export const Button = ({ label }: { label: string }) => <button>{label}</button>;
      `,
    });
    const button = output.nodes.find((n) => n.name === 'Button');
    expect(button?.kind).toBe('component');
    expect(button?.exported).toBe(true);
  });

  test('builds intra-file call edges', () => {
    const output = parseJsTs({
      projectId: 'p1',
      filePath: 'src/math.ts',
      content: `
        function helper(x: number): number {
          return x * 2;
        }

        export function compute(x: number): number {
          return helper(x);
        }
      `,
    });

    const compute = output.nodes.find((n) => n.name === 'compute');
    const helper = output.nodes.find((n) => n.name === 'helper');
    expect(compute).toBeDefined();
    expect(helper).toBeDefined();

    const edge = output.callEdges.find(
      (e) => e.callerIdentity === compute?.identity && e.calleeIdentity === helper?.identity,
    );
    expect(edge).toBeDefined();
    expect(edge?.unresolved).toBe(false);
  });

  test('records imports', () => {
    const output = parseJsTs({
      projectId: 'p1',
      filePath: 'src/server.ts',
      content: `
        import express from 'express';
        import { z } from 'zod';

        const app = express();
        app.get('/', (_req, res) => res.send('ok'));
      `,
    });
    expect(output.imports.map((i) => i.from).sort()).toEqual(['express', 'zod']);
  });
});
