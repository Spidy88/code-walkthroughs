import type { EntryPoint } from '@cw/shared';
import { ulid } from '@cw/shared';
import type {
  ClassifierSignal,
  FrameworkAdapter,
  FrameworkEntryPointInput,
} from '../../adapter.ts';

const EXPRESS_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'all',
]);

export const expressFrameworkAdapter: FrameworkAdapter = {
  name: 'express',
  detect(_project, files) {
    return files.some((f) => f.imports.some((i) => i.from === 'express'));
  },
  detectEntryPoints(input) {
    return detectExpressRoutes(input);
  },
  classifierSignals: expressClassifierSignals(),
};

function expressClassifierSignals(): readonly ClassifierSignal[] {
  return [
    {
      name: 'express:router-user',
      kind: 'import-based',
      weight: 'high',
      match: ({ parsed }) => {
        const usesExpress = parsed.imports.some((i) => i.from === 'express');
        if (!usesExpress) return null;
        // Presence of express import alone is not enough; combined weight emerges when
        // path signals also point at route_handler.
        return null;
      },
    },
  ];
}

function detectExpressRoutes(input: FrameworkEntryPointInput): readonly EntryPoint[] {
  const entries: EntryPoint[] = [];
  for (const file of input.files) {
    const usesExpress = file.imports.some((i) => i.from === 'express');
    if (!usesExpress) continue;

    for (const edge of file.callEdges) {
      const method = edge.calleeIdentity?.split(':').at(-1);
      if (!method || !EXPRESS_METHODS.has(method)) continue;

      // The parser emits two edges per `app.method(path, handler)` call:
      //   1. The function CONTAINING the call → 'method' (lexical-scope edge)
      //   2. The handler function → 'method' (handler-attached edge)
      // Only edge 2 represents an actual entry point — edge 1 is just the
      // registration scope. Counting both produced duplicate entries when
      // routes were wrapped in a registration function. See regression
      // test "registers routes inside a wrapping function".
      if (edge.unresolvedHint !== 'handler-attached') continue;

      entries.push({
        id: ulid(),
        kind: 'http_route',
        framework: 'express',
        projectId: input.project.id,
        nodeIdentity: edge.callerIdentity,
        metadata: {
          method: method.toUpperCase(),
          callSite: edge.callSite,
          sourceFile: file.file.path,
        },
      });
    }
  }
  return entries;
}
