import { jsTsAdapter } from '@cw/adapters';
import type { ProjectMeta } from '@cw/shared';
import { describe, expect, test } from 'vitest';
import { computeComparisonDelta } from '../src/comparison/delta.ts';
import { runAnalysis } from '../src/run.ts';

const project: ProjectMeta = {
  id: 'proj',
  codebaseId: 'cb' as ProjectMeta['codebaseId'],
  name: 'cmp',
  rootPath: '/tmp/cmp',
  language: 'typescript',
  frameworks: [],
  walkable: true,
};

describe('computeComparisonDelta', () => {
  test('flags an export_added when a function is newly exported', async () => {
    const base = await runAnalysis(jsTsAdapter, {
      project,
      files: [{ filePath: 'src/lib.ts', content: 'function helper() { return 1; }' }],
    });
    const head = await runAnalysis(jsTsAdapter, {
      project,
      files: [{ filePath: 'src/lib.ts', content: 'export function helper() { return 1; }' }],
    });
    const delta = computeComparisonDelta({ base, head });
    const change = delta.contractChanges.find((c) => c.kind === 'export_added');
    expect(change).toBeDefined();
    expect(change?.nodeIdentity.endsWith(':helper')).toBe(true);
  });

  test('flags an export_removed when an exported function disappears', async () => {
    const base = await runAnalysis(jsTsAdapter, {
      project,
      files: [{ filePath: 'src/lib.ts', content: 'export function helper() { return 1; }' }],
    });
    const head = await runAnalysis(jsTsAdapter, {
      project,
      files: [{ filePath: 'src/lib.ts', content: '// helper removed' }],
    });
    const delta = computeComparisonDelta({ base, head });
    const change = delta.contractChanges.find((c) => c.kind === 'export_removed');
    expect(change).toBeDefined();
    expect(change?.nodeIdentity.endsWith(':helper')).toBe(true);
  });

  test('detects param_added when a function gains a parameter', async () => {
    const base = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/lib.ts',
          content: 'export function greet(name: string): string { return name; }',
        },
      ],
    });
    const head = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/lib.ts',
          content:
            'export function greet(name: string, salutation: string): string { return name; }',
        },
      ],
    });
    const delta = computeComparisonDelta({ base, head });
    const change = delta.contractChanges.find((c) => c.kind === 'param_added');
    expect(change).toBeDefined();
    expect(change?.nodeIdentity.endsWith(':greet')).toBe(true);
    expect(change?.note).toMatch(/gained 1/);
  });

  test('detects return_type_changed when the explicit return annotation flips', async () => {
    const base = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/lib.ts',
          content: 'export function getId(): string { return "x"; }',
        },
      ],
    });
    const head = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/lib.ts',
          content: 'export function getId(): number { return 1; }',
        },
      ],
    });
    const delta = computeComparisonDelta({ base, head });
    const change = delta.contractChanges.find((c) => c.kind === 'return_type_changed');
    expect(change).toBeDefined();
    expect(change?.note).toMatch(/string.*number/);
  });

  test('classifies path deltas — unchanged, modified_in_place, net_new', async () => {
    const base = await runAnalysis(jsTsAdapter, {
      project: { ...project, frameworks: ['express'] },
      files: [
        {
          filePath: 'src/server.ts',
          content: `
            import express from 'express';
            const app = express();
            app.get('/users', async function listUsers(_req, res) { res.json([]); });
          `,
        },
      ],
    });
    // Head adds a new POST route + tweaks the GET handler body so its
    // pathId is the same (entry.nodeIdentity-derived) but the
    // sequence + content changes.
    const head = await runAnalysis(jsTsAdapter, {
      project: { ...project, frameworks: ['express'] },
      files: [
        {
          filePath: 'src/server.ts',
          content: `
            import express from 'express';
            const app = express();
            app.get('/users', async function listUsers(_req, res) {
              const v = 1 + 1;
              res.json([v]);
            });
            app.post('/users', async function createUser(_req, res) { res.status(201).end(); });
          `,
        },
      ],
    });
    const delta = computeComparisonDelta({ base, head });
    const classifications = new Set(delta.pathDeltas.map((d) => d.classification));
    expect(classifications.has('net_new')).toBe(true);
  });
});
