import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { NodeRuntimeState, ReviewStatusRow } from '@cw/shared';
import { TRPCError } from '@trpc/server';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  analyzedNodes,
  callEdges,
  classifications,
  entryPoints,
  files,
  pathNodes,
  paths,
} from '../db/schema/cache/index.ts';
import { reviewStatus } from '../db/schema/state/review.ts';
import { router, scopedProcedure } from './trpc.ts';

export const walkthroughRouter = router({
  /**
   * v1 supports one project per codebase. The project's id is the codebase
   * hash; its name comes from the user label or the path basename.
   */
  listProjects: scopedProcedure.query(({ ctx }) => {
    const cb = ctx.codebase;
    return [
      {
        id: cb.hash,
        name: cb.label ?? basename(cb.absolutePath),
        rootPath: cb.absolutePath,
        walkable: true,
      },
    ];
  }),

  entryPoints: scopedProcedure.query(async ({ ctx }) => {
    return ctx.codebase.dbs.cache.select().from(entryPoints);
  }),

  paths: scopedProcedure.query(async ({ ctx }) => {
    const cache = ctx.codebase.dbs.cache;
    const pathRows = await cache.select().from(paths);
    const nodeRows = await cache.select().from(pathNodes).orderBy(asc(pathNodes.position));
    const byPath = new Map<string, typeof nodeRows>();
    for (const n of nodeRows) {
      const existing = byPath.get(n.pathId) ?? [];
      existing.push(n);
      byPath.set(n.pathId, existing);
    }
    return pathRows.map((p) => ({
      ...p,
      nodes: byPath.get(p.id) ?? [],
    }));
  }),

  /**
   * Returns a single path with its ordered nodes joined to analyzed-node
   * details (name, kind, file path, line range) and classifications. The
   * walkthrough canvas uses this to lay out a graph in one round-trip.
   */
  getPath: scopedProcedure
    .input(z.object({ pathId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const cache = ctx.codebase.dbs.cache;
      const [pathRow] = await cache.select().from(paths).where(eq(paths.id, input.pathId));
      if (!pathRow) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'path not found' });
      }
      const orderedNodes = await cache
        .select()
        .from(pathNodes)
        .where(eq(pathNodes.pathId, input.pathId))
        .orderBy(asc(pathNodes.position));

      const state = ctx.codebase.dbs.state;
      const identities = orderedNodes.map((n) => n.nodeIdentity);
      const [analyzed, classified, [entryRow], reviews] = await Promise.all([
        identities.length > 0
          ? cache
              .select()
              .from(analyzedNodes)
              .where(inArray(analyzedNodes.nodeIdentity, identities))
          : Promise.resolve([]),
        identities.length > 0
          ? cache
              .select()
              .from(classifications)
              .where(inArray(classifications.nodeIdentity, identities))
          : Promise.resolve([]),
        cache.select().from(entryPoints).where(eq(entryPoints.id, pathRow.entryPointId)),
        identities.length > 0
          ? state.select().from(reviewStatus).where(inArray(reviewStatus.nodeIdentity, identities))
          : Promise.resolve([]),
      ]);

      const analyzedByIdentity = new Map(analyzed.map((a) => [a.nodeIdentity, a]));
      const classByIdentity = new Map(classified.map((c) => [c.nodeIdentity, c]));

      // For status resolution we use the global-scope row when present and
      // fall back to a path-scoped row that matches this path. Path-scoped
      // approvals are an explicit opt-in (spec §8.4) — without one, the
      // global row is authoritative.
      const reviewsByIdentity = new Map<string, typeof reviews>();
      for (const r of reviews) {
        const arr = reviewsByIdentity.get(r.nodeIdentity) ?? [];
        arr.push(r);
        reviewsByIdentity.set(r.nodeIdentity, arr);
      }

      return {
        path: pathRow,
        entryPoint: entryRow ?? null,
        nodes: orderedNodes.map((n) => {
          const cls = classByIdentity.get(n.nodeIdentity) ?? null;
          const candidates = reviewsByIdentity.get(n.nodeIdentity) ?? [];
          const runtimeState = computeRuntimeState({
            candidates,
            pathId: input.pathId,
            currentCodeHash: cls?.contentHash ?? null,
          });
          return {
            position: n.position,
            nodeIdentity: n.nodeIdentity,
            forkGroup: n.forkGroup,
            changeKind: n.changeKind,
            cycleBackToPosition: n.cycleBackToPosition,
            analyzed: analyzedByIdentity.get(n.nodeIdentity) ?? null,
            classification: cls,
            runtimeState,
          };
        }),
      };
    }),

  getRuntimeState: scopedProcedure
    .input(z.object({ nodeIdentity: z.string().min(1), pathId: z.string().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const state = ctx.codebase.dbs.state;
      const cache = ctx.codebase.dbs.cache;
      const [reviews, [classification]] = await Promise.all([
        state.select().from(reviewStatus).where(eq(reviewStatus.nodeIdentity, input.nodeIdentity)),
        cache
          .select()
          .from(classifications)
          .where(eq(classifications.nodeIdentity, input.nodeIdentity)),
      ]);
      return computeRuntimeState({
        candidates: reviews,
        pathId: input.pathId ?? null,
        currentCodeHash: classification?.contentHash ?? null,
      });
    }),

  /**
   * Returns one row per analyzed file with the file-level
   * classification and a small roll-up of per-function review state
   * (counts by runtime kind). Used by the file browser to render the
   * tree with status indicators per file (spec §6.4).
   */
  getFileTree: scopedProcedure.query(async ({ ctx }) => {
    const cache = ctx.codebase.dbs.cache;
    const state = ctx.codebase.dbs.state;
    const [fileRows, allNodes, allClassifications, reviews] = await Promise.all([
      cache.select().from(files),
      cache.select().from(analyzedNodes),
      cache.select().from(classifications),
      state.select().from(reviewStatus),
    ]);
    const classByIdentity = new Map(allClassifications.map((c) => [c.nodeIdentity, c]));
    const reviewsByIdentity = new Map<string, typeof reviews>();
    for (const r of reviews) {
      const arr = reviewsByIdentity.get(r.nodeIdentity) ?? [];
      arr.push(r);
      reviewsByIdentity.set(r.nodeIdentity, arr);
    }
    const nodesByFile = new Map<string, typeof allNodes>();
    for (const n of allNodes) {
      const arr = nodesByFile.get(n.filePath) ?? [];
      arr.push(n);
      nodesByFile.set(n.filePath, arr);
    }
    return fileRows
      .map((f) => {
        const fileClass = classByIdentity.get(`file:${f.path}`) ?? null;
        const functionNodes = nodesByFile.get(f.path) ?? [];
        let approved = 0;
        let rejected = 0;
        let infoRequested = 0;
        let stale = 0;
        let neverReviewed = 0;
        for (const node of functionNodes) {
          const candidates = reviewsByIdentity.get(node.nodeIdentity) ?? [];
          const cls = classByIdentity.get(node.nodeIdentity) ?? null;
          const runtime = computeRuntimeState({
            candidates,
            pathId: null,
            currentCodeHash: cls?.contentHash ?? null,
          });
          if (runtime.kind === 'reviewed_current') {
            if (runtime.current.status === 'approved') approved += 1;
            else if (runtime.current.status === 'rejected') rejected += 1;
            else infoRequested += 1;
          } else if (runtime.kind === 'reviewed_stale') {
            stale += 1;
          } else if (runtime.kind === 'info_requested') {
            infoRequested += 1;
          } else {
            neverReviewed += 1;
          }
        }
        return {
          path: f.path,
          language: f.language,
          size: f.size,
          classification: fileClass
            ? {
                classification: fileClass.classification,
                confidence: fileClass.confidence,
                source: fileClass.source,
              }
            : null,
          functionCount: functionNodes.length,
          counts: { approved, rejected, infoRequested, stale, neverReviewed },
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));
  }),

  /**
   * Returns one analyzed file with full source on disk plus the list
   * of analyzed nodes inside it (each with classification and runtime
   * review state). The file view uses this to render code with
   * per-function status chips next to each function header.
   */
  getFile: scopedProcedure
    .input(z.object({ filePath: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const cache = ctx.codebase.dbs.cache;
      const state = ctx.codebase.dbs.state;
      const [[fileRow], allNodes, allClassifications] = await Promise.all([
        cache.select().from(files).where(eq(files.path, input.filePath)),
        cache.select().from(analyzedNodes).where(eq(analyzedNodes.filePath, input.filePath)),
        cache.select().from(classifications).where(eq(classifications.filePath, input.filePath)),
      ]);
      if (!fileRow) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'file not found' });
      }
      // Pull review_status for the file pseudo-identity plus every
      // analyzed function in the file in one round-trip. We need the
      // node list before we can build the IN clause, so this can't
      // sit in the Promise.all above.
      const identities = [`file:${input.filePath}`, ...allNodes.map((n) => n.nodeIdentity)];
      const allReviews = await state
        .select()
        .from(reviewStatus)
        .where(inArray(reviewStatus.nodeIdentity, identities));

      const classByIdentity = new Map(allClassifications.map((c) => [c.nodeIdentity, c]));
      const reviewsByIdentity = new Map<string, typeof allReviews>();
      for (const r of allReviews) {
        const arr = reviewsByIdentity.get(r.nodeIdentity) ?? [];
        arr.push(r);
        reviewsByIdentity.set(r.nodeIdentity, arr);
      }
      const fileClass = classByIdentity.get(`file:${input.filePath}`) ?? null;
      const fileRuntime = computeRuntimeState({
        candidates: reviewsByIdentity.get(`file:${input.filePath}`) ?? [],
        pathId: null,
        currentCodeHash: fileClass?.contentHash ?? null,
      });

      const absPath = resolve(ctx.codebase.absolutePath, input.filePath);
      let body = '';
      try {
        body = await readFile(absPath, 'utf8');
      } catch (err) {
        ctx.logger.warn({ err, path: absPath }, 'failed to read file body from disk');
      }

      const functions = allNodes
        .map((n) => {
          const cls = classByIdentity.get(n.nodeIdentity) ?? null;
          const candidates = reviewsByIdentity.get(n.nodeIdentity) ?? [];
          const runtime = computeRuntimeState({
            candidates,
            pathId: null,
            currentCodeHash: cls?.contentHash ?? null,
          });
          return {
            nodeIdentity: n.nodeIdentity,
            name: n.name,
            kind: n.kind,
            startLine: n.startLine,
            endLine: n.endLine,
            exported: n.exported,
            classification: cls
              ? {
                  classification: cls.classification,
                  confidence: cls.confidence,
                  justification: cls.justification,
                  source: cls.source,
                }
              : null,
            runtimeState: runtime,
          };
        })
        .sort((a, b) => a.startLine - b.startLine);

      return {
        file: {
          path: fileRow.path,
          language: fileRow.language,
          size: fileRow.size,
          classification: fileClass
            ? {
                classification: fileClass.classification,
                confidence: fileClass.confidence,
                justification: fileClass.justification,
                source: fileClass.source,
              }
            : null,
          runtimeState: fileRuntime,
        },
        body,
        functions,
      };
    }),

  /**
   * Returns the resolved downstream callees of a node — the set of
   * functions it calls, deduped, joined to analyzed metadata,
   * classifications, and runtime review state. Used by the walkthrough
   * canvas to render the dig-into affordance per spec §6.3.
   *
   * Excludes unresolved edges (externals, indirect calls). The optional
   * pathId scopes runtimeState to that path's review (if a path-scoped
   * row exists).
   */
  getNodeCallees: scopedProcedure
    .input(
      z.object({
        nodeIdentity: z.string().min(1),
        pathId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cache = ctx.codebase.dbs.cache;
      const state = ctx.codebase.dbs.state;

      const edges = await cache
        .select()
        .from(callEdges)
        .where(
          and(
            eq(callEdges.callerIdentity, input.nodeIdentity),
            eq(callEdges.unresolved, false),
            isNotNull(callEdges.calleeIdentity),
          ),
        );

      // Dedupe callees, keep the first (lowest) call site we see for
      // each so the UI has a stable line number to display.
      const calleeOrder: string[] = [];
      const firstCallSite = new Map<string, { line: number; column: number }>();
      for (const e of edges) {
        if (!e.calleeIdentity) continue;
        if (!firstCallSite.has(e.calleeIdentity)) {
          calleeOrder.push(e.calleeIdentity);
          firstCallSite.set(e.calleeIdentity, {
            line: e.callSiteLine,
            column: e.callSiteColumn,
          });
        }
      }

      if (calleeOrder.length === 0) {
        return { callees: [] as const };
      }

      const [analyzed, classified, reviews] = await Promise.all([
        cache.select().from(analyzedNodes).where(inArray(analyzedNodes.nodeIdentity, calleeOrder)),
        cache
          .select()
          .from(classifications)
          .where(inArray(classifications.nodeIdentity, calleeOrder)),
        state.select().from(reviewStatus).where(inArray(reviewStatus.nodeIdentity, calleeOrder)),
      ]);

      const analyzedByIdentity = new Map(analyzed.map((a) => [a.nodeIdentity, a]));
      const classByIdentity = new Map(classified.map((c) => [c.nodeIdentity, c]));
      const reviewsByIdentity = new Map<string, typeof reviews>();
      for (const r of reviews) {
        const arr = reviewsByIdentity.get(r.nodeIdentity) ?? [];
        arr.push(r);
        reviewsByIdentity.set(r.nodeIdentity, arr);
      }

      return {
        callees: calleeOrder
          // The analyzer can record edges to functions that didn't make
          // it into analyzed_nodes (e.g., a tracked sink filtered out
          // before persistence). Skip those rather than leak nulls.
          .filter((id) => analyzedByIdentity.has(id))
          .map((id) => {
            const cls = classByIdentity.get(id) ?? null;
            const candidates = reviewsByIdentity.get(id) ?? [];
            const runtimeState = computeRuntimeState({
              candidates,
              pathId: input.pathId ?? null,
              currentCodeHash: cls?.contentHash ?? null,
            });
            return {
              nodeIdentity: id,
              callSite: firstCallSite.get(id) ?? { line: 0, column: 0 },
              analyzed: analyzedByIdentity.get(id) ?? null,
              classification: cls,
              runtimeState,
            };
          }),
      };
    }),

  /**
   * Returns a single analyzed node plus the source code for its line
   * range. Reads the file off disk on demand — small enough at v1 since
   * one node fetch happens per focus change. Future optimisation could
   * persist the snippet on the node row.
   */
  getNode: scopedProcedure
    .input(
      z.object({
        nodeIdentity: z.string().min(1),
        pathId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cache = ctx.codebase.dbs.cache;
      const state = ctx.codebase.dbs.state;
      const [[analyzed], [classification], reviews] = await Promise.all([
        cache
          .select()
          .from(analyzedNodes)
          .where(eq(analyzedNodes.nodeIdentity, input.nodeIdentity)),
        cache
          .select()
          .from(classifications)
          .where(eq(classifications.nodeIdentity, input.nodeIdentity)),
        state.select().from(reviewStatus).where(eq(reviewStatus.nodeIdentity, input.nodeIdentity)),
      ]);
      if (!analyzed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'node not found' });
      }

      const absPath = resolve(ctx.codebase.absolutePath, analyzed.filePath);
      let body = '';
      try {
        const contents = await readFile(absPath, 'utf8');
        const lines = contents.split('\n');
        const start = Math.max(0, analyzed.startLine - 1);
        const end = Math.min(lines.length, analyzed.endLine);
        body = lines.slice(start, end).join('\n');
      } catch (err) {
        ctx.logger.warn({ err, path: absPath }, 'failed to read node body from disk');
      }

      const runtimeState = computeRuntimeState({
        candidates: reviews,
        pathId: input.pathId ?? null,
        currentCodeHash: classification?.contentHash ?? null,
      });

      return {
        analyzed,
        classification: classification ?? null,
        body,
        runtimeState,
      };
    }),
});

/**
 * Resolves the four-state node runtime status from the candidate review
 * rows for a node. Implements spec §11.1:
 *
 *   - never_reviewed     — no row at all
 *   - reviewed_current   — row exists, codeHash matches; status approved/rejected
 *   - reviewed_stale     — row exists, codeHash differs (the body changed)
 *   - info_requested     — most-recent row's status is info_requested
 *
 * Scope precedence: a path-scoped row matching the current pathId wins
 * over a global row. Without a path-scoped row, the global row is used.
 */
function computeRuntimeState(input: {
  candidates: ReadonlyArray<{
    readonly id: string;
    readonly nodeIdentity: string;
    readonly scope: string;
    readonly status: string;
    readonly comment: string | null;
    readonly codeHash: string;
    readonly reviewerId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>;
  pathId: string | null;
  currentCodeHash: string | null;
}): NodeRuntimeState {
  if (input.candidates.length === 0) return { kind: 'never_reviewed' };

  const pathScoped = input.pathId
    ? input.candidates.find((c) => c.scope === `path:${input.pathId}`)
    : undefined;
  const global = input.candidates.find((c) => c.scope === 'global');
  const chosen = pathScoped ?? global ?? input.candidates[0];
  if (!chosen) return { kind: 'never_reviewed' };

  const row: ReviewStatusRow = {
    id: chosen.id,
    nodeIdentity: chosen.nodeIdentity,
    scope:
      chosen.scope === 'global'
        ? { kind: 'global' }
        : { kind: 'path', pathId: chosen.scope.slice('path:'.length) },
    status: chosen.status as ReviewStatusRow['status'],
    comment: chosen.comment,
    codeHash: chosen.codeHash,
    reviewerId: chosen.reviewerId,
    createdAt: chosen.createdAt,
    updatedAt: chosen.updatedAt,
  };

  const stale =
    input.currentCodeHash !== null && row.codeHash !== '' && row.codeHash !== input.currentCodeHash;

  if (stale) {
    return {
      kind: 'reviewed_stale',
      prior: row,
      stalenessDetectedAt: row.updatedAt,
    };
  }
  if (row.status === 'info_requested') {
    return { kind: 'info_requested', current: row };
  }
  return { kind: 'reviewed_current', current: row };
}
