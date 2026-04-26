import type { CallEdge, ParseOutput } from '@cw/adapters';
import { describe, expect, test } from 'vitest';
import { resolveCrossFileCallEdges } from '../src/paths/resolve-cross-file.ts';

const PROJECT = 'proj';

function id(file: string, symbol: string): string {
  return `${PROJECT}:${file}:${symbol}`;
}

function file(
  path: string,
  options: {
    nodes?: string[];
    exports?: ReadonlyArray<{ name: string; symbol?: string }>;
    imports?: ReadonlyArray<{ from: string; specifiers: string[] }>;
    callEdges?: ReadonlyArray<CallEdge>;
  } = {},
): ParseOutput {
  return {
    file: { projectId: PROJECT, path, contentHash: '', language: 'ts', size: 0, analyzedAt: '' },
    nodes: (options.nodes ?? []).map((name) => ({
      identity: id(path, name),
      filePath: path,
      projectId: PROJECT,
      kind: 'function' as const,
      name,
      startLine: 1,
      endLine: 5,
      exported: true,
      contentHash: '',
    })),
    imports: options.imports ?? [],
    exports: (options.exports ?? []).map((e) => ({
      name: e.name,
      nodeIdentity: id(path, e.symbol ?? e.name),
    })),
    callEdges: options.callEdges ?? [],
  };
}

describe('resolveCrossFileCallEdges', () => {
  test('rewrites a cross-file edge when the called name is a relative import', () => {
    // Arrange — handler at routes/users.ts calls listUsers, which is
    // defined and exported from services/userService.ts.
    const files = [
      file('src/services/userService.ts', {
        nodes: ['listUsers'],
        exports: [{ name: 'listUsers' }],
      }),
      file('src/routes/users.ts', {
        nodes: ['listAllUsers'],
        imports: [{ from: '../services/userService.ts', specifiers: ['listUsers'] }],
        callEdges: [
          {
            callerIdentity: id('src/routes/users.ts', 'listAllUsers'),
            callSite: { line: 4, column: 0 },
            // Pre-resolution: the parser fabricates an identity in the caller's
            // file because it can't see across files.
            calleeIdentity: id('src/routes/users.ts', 'listUsers'),
            unresolved: true,
            unresolvedHint: 'cross-file-or-external',
          },
        ],
      }),
    ];

    // Act
    const out = resolveCrossFileCallEdges(files);

    // Assert
    const handlerFile = out.find((f) => f.file.path === 'src/routes/users.ts');
    if (!handlerFile) throw new Error('expected handler file');
    expect(handlerFile.callEdges).toHaveLength(1);
    expect(handlerFile.callEdges[0]).toMatchObject({
      calleeIdentity: id('src/services/userService.ts', 'listUsers'),
      unresolved: false,
    });
  });

  test('handles imports without an extension by trying .ts / .tsx / .js / .jsx / index', () => {
    const files = [
      file('src/services/userService.ts', {
        nodes: ['listUsers'],
        exports: [{ name: 'listUsers' }],
      }),
      file('src/routes/users.ts', {
        imports: [{ from: '../services/userService', specifiers: ['listUsers'] }],
        callEdges: [
          {
            callerIdentity: id('src/routes/users.ts', 'caller'),
            callSite: { line: 1, column: 0 },
            calleeIdentity: id('src/routes/users.ts', 'listUsers'),
            unresolved: true,
            unresolvedHint: 'cross-file-or-external',
          },
        ],
      }),
    ];

    const out = resolveCrossFileCallEdges(files);
    const handler = out.find((f) => f.file.path === 'src/routes/users.ts');
    expect(handler?.callEdges[0]?.calleeIdentity).toBe(
      id('src/services/userService.ts', 'listUsers'),
    );
  });

  test('leaves external imports alone (no relative path)', () => {
    const files = [
      file('src/server.ts', {
        imports: [{ from: 'express', specifiers: ['express'] }],
        callEdges: [
          {
            callerIdentity: id('src/server.ts', 'main'),
            callSite: { line: 1, column: 0 },
            calleeIdentity: id('src/server.ts', 'express'),
            unresolved: true,
            unresolvedHint: 'cross-file-or-external',
          },
        ],
      }),
    ];

    const out = resolveCrossFileCallEdges(files);
    expect(out[0]?.callEdges[0]?.unresolved).toBe(true);
  });

  test('leaves resolved edges untouched', () => {
    const files = [
      file('src/foo.ts', {
        nodes: ['a', 'b'],
        callEdges: [
          {
            callerIdentity: id('src/foo.ts', 'a'),
            callSite: { line: 1, column: 0 },
            calleeIdentity: id('src/foo.ts', 'b'),
            unresolved: false,
          },
        ],
      }),
    ];

    const out = resolveCrossFileCallEdges(files);
    expect(out[0]?.callEdges).toEqual(files[0]?.callEdges);
  });

  test('does not crash on empty inputs', () => {
    expect(() => resolveCrossFileCallEdges([])).not.toThrow();
  });
});
