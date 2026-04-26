import { jsTsAdapter } from '@cw/adapters';
import type { ProjectMeta } from '@cw/shared';
import { describe, expect, test } from 'vitest';
import { runAnalysis } from '../src/run.ts';

const project: ProjectMeta = {
  id: 'proj',
  codebaseId: 'cb' as ProjectMeta['codebaseId'],
  name: 'sample-express',
  rootPath: '/tmp/sample',
  language: 'typescript',
  frameworks: ['express'],
  walkable: true,
};

describe('runAnalysis — LLM disabled', () => {
  test('parses, classifies deterministically, detects express entry points, and traces paths', async () => {
    const result = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/server.ts',
          content: `
            import express from 'express';
            import { listUsers } from './services/users';

            const app = express();
            app.get('/users', async function handleListUsers(_req, res) {
              const users = await loadUsers();
              res.json(users);
            });

            async function loadUsers() {
              return listUsers();
            }
          `,
        },
        {
          filePath: 'src/services/users.ts',
          content: `
            export async function listUsers() { return []; }
          `,
        },
      ],
    });

    expect(result.parsedFiles).toHaveLength(2);

    const serverClassification = result.classifications.find(
      (c) => c.nodeIdentity === 'file:src/server.ts',
    );
    const servicesClassification = result.classifications.find(
      (c) => c.nodeIdentity === 'file:src/services/users.ts',
    );

    expect(servicesClassification?.classification).toBe('service');
    expect(servicesClassification?.source).toBe('stage1');
    expect(serverClassification?.source).toBe('stage1');

    expect(result.entryPoints).toHaveLength(1);
    expect(result.entryPoints[0]?.framework).toBe('express');
    expect(result.entryPoints[0]?.metadata.method).toBe('GET');

    expect(result.paths).toHaveLength(1);
    const pathNodes = result.pathNodes.filter((n) => n.pathId === result.paths[0]?.id);
    const orderedNames = pathNodes.map((n) => n.nodeIdentity.split(':').at(-1));
    expect(orderedNames[0]).toBe('handleListUsers');
    expect(orderedNames).toContain('loadUsers');
  });

  // Chunk 7A — the dig-into UI relies on parsedFiles in AnalysisOutput
  // exposing *resolved* call edges (cross-file imports patched), so a
  // call from server.handleListUsers → services.listUsers shows up as
  // a resolved edge in the persistence path. Without this, the
  // walkthrough.getNodeCallees query would have nothing to render.
  test('parsedFiles output exposes resolved cross-file call edges', async () => {
    const result = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/server.ts',
          content: `
            import { listUsers } from './services/users.ts';
            export async function loadUsers() {
              return listUsers();
            }
          `,
        },
        {
          filePath: 'src/services/users.ts',
          content: 'export async function listUsers() { return []; }',
        },
      ],
    });

    const serverFile = result.parsedFiles.find((p) => p.file.path === 'src/server.ts');
    expect(serverFile).toBeDefined();

    const edge = serverFile?.callEdges.find((e) => e.callerIdentity.endsWith(':loadUsers'));
    expect(edge).toBeDefined();
    expect(edge?.unresolved).toBe(false);
    expect(edge?.calleeIdentity).toBe('proj:src/services/users.ts:listUsers');
  });

  // Chunk 9B — when a path node has multiple resolvable callees, the
  // analyzer must (a) emit a `path_branch` prep question with the
  // candidates, and (b) honour a reviewer-supplied branch answer when
  // present rather than defaulting to the first resolvable callee.
  test('emits path_branch question on multi-callee node and honours branchAnswers', async () => {
    const files = [
      {
        filePath: 'src/server.ts',
        content: `
          import express from 'express';
          import { left } from './services/left.ts';
          import { right } from './services/right.ts';
          const app = express();
          app.get('/x', async function handleX(_req, res) {
            await left();
            await right();
            res.json({});
          });
        `,
      },
      {
        filePath: 'src/services/left.ts',
        content: 'export async function left() { return 1; }',
      },
      {
        filePath: 'src/services/right.ts',
        content: 'export async function right() { return 2; }',
      },
    ];

    // Default run: branch question emitted, default path follows the
    // first resolvable callee (left).
    const defaultRun = await runAnalysis(jsTsAdapter, { project, files });
    const branchQs = defaultRun.prepQuestions.filter((q) => q.kind === 'path_branch');
    expect(branchQs).toHaveLength(1);
    const ctx = branchQs[0]?.context as {
      kind: 'path_branch';
      callerIdentity: string;
      candidates: readonly string[];
    };
    expect(ctx.candidates.length).toBeGreaterThanOrEqual(2);
    expect(ctx.candidates.some((c) => c.endsWith(':left'))).toBe(true);
    expect(ctx.candidates.some((c) => c.endsWith(':right'))).toBe(true);
    const defaultPath = defaultRun.pathNodes
      .filter((n) => n.pathId === defaultRun.paths[0]?.id)
      .map((n) => n.nodeIdentity);
    expect(defaultPath.some((id) => id.endsWith(':left'))).toBe(true);

    // Re-run with the answer "follow right". The branch question's
    // key is stable across runs, so the answer keys match.
    const branchAnswers = new Map<string, string>();
    const key = branchQs[0]?.key ?? '';
    const rightCandidate = ctx.candidates.find((c) => c.endsWith(':right')) ?? '';
    branchAnswers.set(key, rightCandidate);

    const answeredRun = await runAnalysis(jsTsAdapter, { project, files, branchAnswers });
    const answeredPath = answeredRun.pathNodes
      .filter((n) => n.pathId === answeredRun.paths[0]?.id)
      .map((n) => n.nodeIdentity);
    expect(answeredPath.some((id) => id.endsWith(':right'))).toBe(true);
    expect(answeredPath.some((id) => id.endsWith(':left'))).toBe(false);
  });

  test('no LLM callback means no architectural hints', async () => {
    const result = await runAnalysis(jsTsAdapter, {
      project,
      files: [{ filePath: 'src/a.ts', content: 'export const x = 1;' }],
    });
    expect(result.architecturalHints).toBeNull();
  });

  // Chunk 11 — LLM degradation contract. With LLM disabled, every
  // classification row must come from stage1 (deterministic signals).
  // Stage 2 is the LLM augmentation pass — when no callback is wired,
  // it must not silently fall back to a different source label.
  test('LLM-off path leaves classification source as stage1', async () => {
    const result = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/services/users.ts',
          content: 'export async function listUsers() { return []; }',
        },
        {
          filePath: 'src/db/userRepo.ts',
          content: 'export async function selectUserById(id: number) { return { id }; }',
        },
      ],
    });
    expect(result.classifications.length).toBeGreaterThan(0);
    for (const c of result.classifications) {
      expect(c.source).toBe('stage1');
    }
  });
});
