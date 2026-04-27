import { jsTsAdapter } from '@cw/adapters';
import { computeComparisonDelta, runAnalysis } from '@cw/analyzer';
import type { CodebaseId, ProjectMeta } from '@cw/shared';
import { z } from 'zod';
import { router, scopedProcedure } from './trpc.ts';

const filesetSchema = z.array(
  z.object({
    filePath: z.string().min(1),
    content: z.string(),
  }),
);

const comparisonRunInputSchema = z.object({
  base: filesetSchema,
  head: filesetSchema,
});

/**
 * v1 comparison data layer: pass two filesets directly (base + head)
 * and get back the delta in-memory. No persistence yet — the chunk
 * 19 UI scaffold uses this directly to render the three-layer
 * comparison surface against fixture data.
 *
 * Real git-ref orchestration (read-tree / extract / cache) is
 * deliberately deferred until the UI is in place; the algorithmic
 * core is what this chunk delivers.
 */
export const comparisonRouter = router({
  run: scopedProcedure.input(comparisonRunInputSchema).mutation(async ({ ctx, input }) => {
    const project: ProjectMeta = {
      id: ctx.codebase.hash,
      codebaseId: ctx.codebase.hash as CodebaseId,
      name: 'comparison',
      rootPath: ctx.codebase.absolutePath,
      language: 'typescript',
      frameworks: [],
      walkable: true,
    };
    const baseOut = await runAnalysis(jsTsAdapter, {
      project,
      files: input.base,
    });
    const headOut = await runAnalysis(jsTsAdapter, {
      project,
      files: input.head,
    });
    const delta = computeComparisonDelta({ base: baseOut, head: headOut });
    return delta;
  }),
});
