import { jsTsAdapter } from '@cw/adapters';
import { computeComparisonDelta, runAnalysis } from '@cw/analyzer';
import type { CodebaseId, ProjectMeta } from '@cw/shared';
import { TRPCError } from '@trpc/server';
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
const comparisonRunRefsInputSchema = z.object({
  baseRef: z.string().min(1),
  headRef: z.string().min(1),
});

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

  /**
   * Real two-ref comparison. Reads each ref's tree via git, filters
   * to JS/TS source files, materialises in-memory filesets via
   * `git show <ref>:<path>`, then runs the existing in-memory
   * comparison.run pipeline.
   *
   * Persistence to a per-(base,head) delta.db is deferred until we
   * see the access pattern. In v1 the delta is recomputed per call
   * — fast enough for fixture-sized codebases.
   */
  runRefs: scopedProcedure.input(comparisonRunRefsInputSchema).mutation(async ({ ctx, input }) => {
    const git = ctx.codebase.git;
    if (!(await git.isRepo())) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'comparison mode requires a git repository',
      });
    }
    const [baseSha, headSha] = await Promise.all([
      git.revParse(input.baseRef),
      git.revParse(input.headRef),
    ]);
    if (!baseSha || !headSha) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `could not resolve refs: base=${input.baseRef} (${baseSha ?? 'unknown'}) head=${input.headRef} (${headSha ?? 'unknown'})`,
      });
    }
    const baseFiles = await collectFilesAtRef(git, baseSha);
    const headFiles = await collectFilesAtRef(git, headSha);

    const project: ProjectMeta = {
      id: ctx.codebase.hash,
      codebaseId: ctx.codebase.hash as CodebaseId,
      name: 'comparison',
      rootPath: ctx.codebase.absolutePath,
      language: 'typescript',
      frameworks: [],
      walkable: true,
    };
    const [baseOut, headOut] = await Promise.all([
      runAnalysis(jsTsAdapter, { project, files: baseFiles }),
      runAnalysis(jsTsAdapter, { project, files: headFiles }),
    ]);
    const delta = computeComparisonDelta({ base: baseOut, head: headOut });
    return {
      delta,
      baseSha,
      headSha,
      baseFileCount: baseFiles.length,
      headFileCount: headFiles.length,
    };
  }),
});

async function collectFilesAtRef(
  git: import('../git/git.ts').Git,
  ref: string,
): Promise<{ filePath: string; content: string }[]> {
  const SOURCE_PATTERN = /\.(ts|tsx|js|jsx|cts|mts)$/;
  const all = await git.listFilesAtRef(ref);
  const sources = all.filter((p) => SOURCE_PATTERN.test(p));
  // Skip node_modules + build output if the repo accidentally
  // tracks them — same heuristic the live analyser uses.
  const tracked = sources.filter(
    (p) => !p.includes('node_modules/') && !p.startsWith('dist/') && !p.includes('/dist/'),
  );
  const out: { filePath: string; content: string }[] = [];
  for (const path of tracked) {
    const content = await git.readFileAtRef(ref, path);
    if (content === null) continue;
    out.push({ filePath: path, content });
  }
  return out;
}
