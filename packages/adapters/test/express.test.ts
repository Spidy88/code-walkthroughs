import type { ProjectMeta } from '@cw/shared';
import { describe, expect, test } from 'vitest';
import { expressFrameworkAdapter } from '../src/js-ts/frameworks/express.ts';
import { parseJsTs } from '../src/js-ts/parse.ts';

const project: ProjectMeta = {
  id: 'proj',
  codebaseId: 'cb' as ProjectMeta['codebaseId'],
  name: 'sample',
  rootPath: '/tmp/sample',
  language: 'typescript',
  frameworks: ['express'],
  walkable: true,
};

describe('express framework adapter', () => {
  test('detects app.get / app.post as entry points', () => {
    const file = parseJsTs({
      projectId: 'proj',
      filePath: 'src/server.ts',
      content: `
        import express from 'express';

        const app = express();

        app.get('/users', function listUsers(_req, res) {
          res.json([]);
        });

        app.post('/users', function createUser(_req, res) {
          res.json({});
        });
      `,
    });

    const entries = expressFrameworkAdapter.detectEntryPoints({
      project,
      files: [file],
    });

    expect(entries).toHaveLength(2);
    const methods = entries.map((e) => e.metadata.method).sort();
    expect(methods).toEqual(['GET', 'POST']);
    for (const entry of entries) {
      expect(entry.framework).toBe('express');
      expect(entry.kind).toBe('http_route');
      expect(entry.projectId).toBe('proj');
    }
  });

  test('detects express usage via imports', () => {
    const file = parseJsTs({
      projectId: 'proj',
      filePath: 'src/server.ts',
      content: `import express from 'express'; const app = express();`,
    });
    expect(expressFrameworkAdapter.detect(project, [file])).toBe(true);
  });

  test('does not detect when express is not imported', () => {
    const file = parseJsTs({
      projectId: 'proj',
      filePath: 'src/other.ts',
      content: 'export function noop() {}',
    });
    expect(expressFrameworkAdapter.detect(project, [file])).toBe(false);
  });

  // Regression — bug discovered in chunk 5.5 against the express-tiny fixture:
  // when routes were registered inside a wrapping function, the parser emitted
  // BOTH a lexical-scope edge (registerOrderRoutes → get) AND a handler-attached
  // edge (handler → get). The adapter counted both, producing 2× the expected
  // entry points. This shape didn't appear in the original 'detects app.get /
  // app.post' test because that one called app.get at module top-level, where
  // there's no containing function and only the handler-attached edge fires.
  test('registers routes inside a wrapping function — counts each route once', () => {
    const file = parseJsTs({
      projectId: 'proj',
      filePath: 'src/routes/users.ts',
      content: `
        import express from 'express';
        import type { Express } from 'express';

        export function registerUserRoutes(app: Express): void {
          app.get('/users', async function listAllUsers(_req, res) {
            res.json([]);
          });

          app.post('/users', async function createUser(_req, res) {
            res.status(201).json({});
          });

          app.delete('/users/:id', async function deleteUser(_req, res) {
            res.status(204).end();
          });
        }
      `,
    });

    const entries = expressFrameworkAdapter.detectEntryPoints({
      project,
      files: [file],
    });

    // Three app.method calls inside the wrapping function → exactly three
    // entry points, not six.
    expect(entries).toHaveLength(3);
    const methods = entries.map((e) => e.metadata.method).sort();
    expect(methods).toEqual(['DELETE', 'GET', 'POST']);
    // Each entry's nodeIdentity should be the named handler function, not
    // the wrapping registration function.
    const callerNames = entries.map((e) => e.nodeIdentity.split(':').at(-1)).sort();
    expect(callerNames).toEqual(['createUser', 'deleteUser', 'listAllUsers']);
    for (const entry of entries) {
      expect(entry.nodeIdentity.split(':').at(-1)).not.toBe('registerUserRoutes');
    }
  });
});
