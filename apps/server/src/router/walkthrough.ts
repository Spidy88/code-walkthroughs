import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { TRPCError } from '@trpc/server';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  analyzedNodes,
  classifications,
  entryPoints,
  pathNodes,
  paths,
} from '../db/schema/cache/index.ts';
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

      const identities = orderedNodes.map((n) => n.nodeIdentity);
      const [analyzed, classified, [entryRow]] = await Promise.all([
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
      ]);

      const analyzedByIdentity = new Map(analyzed.map((a) => [a.nodeIdentity, a]));
      const classByIdentity = new Map(classified.map((c) => [c.nodeIdentity, c]));

      return {
        path: pathRow,
        entryPoint: entryRow ?? null,
        nodes: orderedNodes.map((n) => ({
          position: n.position,
          nodeIdentity: n.nodeIdentity,
          forkGroup: n.forkGroup,
          changeKind: n.changeKind,
          cycleBackToPosition: n.cycleBackToPosition,
          analyzed: analyzedByIdentity.get(n.nodeIdentity) ?? null,
          classification: classByIdentity.get(n.nodeIdentity) ?? null,
        })),
      };
    }),

  /**
   * Returns a single analyzed node plus the source code for its line
   * range. Reads the file off disk on demand — small enough at v1 since
   * one node fetch happens per focus change. Future optimisation could
   * persist the snippet on the node row.
   */
  getNode: scopedProcedure
    .input(z.object({ nodeIdentity: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const cache = ctx.codebase.dbs.cache;
      const [[analyzed], [classification]] = await Promise.all([
        cache
          .select()
          .from(analyzedNodes)
          .where(eq(analyzedNodes.nodeIdentity, input.nodeIdentity)),
        cache
          .select()
          .from(classifications)
          .where(eq(classifications.nodeIdentity, input.nodeIdentity)),
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

      return {
        analyzed,
        classification: classification ?? null,
        body,
      };
    }),
});
