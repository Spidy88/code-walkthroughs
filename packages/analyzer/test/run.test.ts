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

  test('no LLM callback means no architectural hints', async () => {
    const result = await runAnalysis(jsTsAdapter, {
      project,
      files: [{ filePath: 'src/a.ts', content: 'export const x = 1;' }],
    });
    expect(result.architecturalHints).toBeNull();
  });
});
