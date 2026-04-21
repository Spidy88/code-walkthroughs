import { asc } from 'drizzle-orm';
import { entryPoints, pathNodes, paths } from '../db/schema/cache/index.ts';
import { router, scopedProcedure } from './trpc.ts';

export const walkthroughRouter = router({
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
});
