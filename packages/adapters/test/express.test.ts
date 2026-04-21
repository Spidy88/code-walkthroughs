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
});
