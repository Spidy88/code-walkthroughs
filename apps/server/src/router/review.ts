import { clearStatusInputSchema, setStatusInputSchema } from '@cw/shared';
import { eq } from 'drizzle-orm';
import { classifications } from '../db/schema/cache/index.ts';
import { createReviewService } from '../review/service.ts';
import { router, scopedProcedure } from './trpc.ts';

const REVIEWER_ID = 'local';

export const reviewRouter = router({
  list: scopedProcedure.query(async ({ ctx }) => {
    const service = createReviewService(ctx.codebase.dbs.state);
    return service.list();
  }),

  setStatus: scopedProcedure.input(setStatusInputSchema).mutation(async ({ ctx, input }) => {
    const service = createReviewService(ctx.codebase.dbs.state);
    const cacheRows = await ctx.codebase.dbs.cache
      .select()
      .from(classifications)
      .where(eq(classifications.nodeIdentity, input.nodeIdentity));
    const codeHash = cacheRows[0]?.contentHash ?? '';
    return service.setStatus({
      nodeIdentity: input.nodeIdentity,
      status: input.status,
      comment: input.comment ?? null,
      codeHash,
      reviewerId: REVIEWER_ID,
      scope: input.pathScope ? { kind: 'path', pathId: input.pathScope } : { kind: 'global' },
      now: ctx.now(),
    });
  }),

  clear: scopedProcedure.input(clearStatusInputSchema).mutation(async ({ ctx, input }) => {
    const service = createReviewService(ctx.codebase.dbs.state);
    return service.clear({
      nodeIdentity: input.nodeIdentity,
      scope: input.pathScope ? { kind: 'path', pathId: input.pathScope } : { kind: 'global' },
      reviewerId: REVIEWER_ID,
      reason: 'manual_clear',
      now: ctx.now(),
    });
  }),
});
