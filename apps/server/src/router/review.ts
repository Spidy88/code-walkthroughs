import {
  addCommentInputSchema,
  clearStatusInputSchema,
  deleteCommentInputSchema,
  listCommentsInputSchema,
  listFunctionCommentsInputSchema,
  promoteScopedApprovalInputSchema,
  setFileStatusInputSchema,
  setStatusInputSchema,
  updateCommentInputSchema,
} from '@cw/shared';
import { eq } from 'drizzle-orm';
import { analyzedNodes, classifications } from '../db/schema/cache/index.ts';
import { createCommentsService } from '../review/comments-service.ts';
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

  promoteScopedApproval: scopedProcedure
    .input(promoteScopedApprovalInputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createReviewService(ctx.codebase.dbs.state);
      return service.promoteScopedApproval({
        nodeIdentity: input.nodeIdentity,
        pathId: input.pathId,
        reviewerId: REVIEWER_ID,
        now: ctx.now(),
      });
    }),

  setFileStatus: scopedProcedure
    .input(setFileStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      const cache = ctx.codebase.dbs.cache;
      // Resolve every analyzed function in the file plus the file's
      // own pseudo-classification so we can ferry codeHashes into the
      // service (used for staleness detection on each row).
      const [nodeRows, fileClassRows] = await Promise.all([
        cache.select().from(analyzedNodes).where(eq(analyzedNodes.filePath, input.filePath)),
        cache
          .select()
          .from(classifications)
          .where(eq(classifications.nodeIdentity, `file:${input.filePath}`)),
      ]);
      const functionIdentities = nodeRows.map((n) => n.nodeIdentity);
      const functionCodeHashByIdentity = new Map(
        nodeRows.map((n) => [n.nodeIdentity, n.contentHash] as const),
      );
      const fileCodeHash = fileClassRows[0]?.contentHash ?? '';
      const service = createReviewService(ctx.codebase.dbs.state);
      return service.setFileStatus({
        filePath: input.filePath,
        functionIdentities,
        functionCodeHashByIdentity,
        fileCodeHash,
        status: input.status,
        comment: input.comment ?? null,
        conflictResolution: input.conflictResolution ?? null,
        reviewerId: REVIEWER_ID,
        now: ctx.now(),
      });
    }),

  addComment: scopedProcedure.input(addCommentInputSchema).mutation(async ({ ctx, input }) => {
    const service = createCommentsService(ctx.codebase.dbs.state);
    return service.add({
      anchor: input.anchor,
      body: input.body,
      reviewerId: REVIEWER_ID,
      now: ctx.now(),
    });
  }),

  updateComment: scopedProcedure
    .input(updateCommentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createCommentsService(ctx.codebase.dbs.state);
      return service.update({ id: input.id, body: input.body, now: ctx.now() });
    }),

  deleteComment: scopedProcedure
    .input(deleteCommentInputSchema)
    .mutation(async ({ ctx, input }) => {
      const service = createCommentsService(ctx.codebase.dbs.state);
      return service.remove({ id: input.id, now: ctx.now() });
    }),

  listComments: scopedProcedure.input(listCommentsInputSchema).query(async ({ ctx, input }) => {
    const service = createCommentsService(ctx.codebase.dbs.state);
    return service.listForAnchor(input);
  }),

  listFunctionComments: scopedProcedure
    .input(listFunctionCommentsInputSchema)
    .query(async ({ ctx, input }) => {
      const service = createCommentsService(ctx.codebase.dbs.state);
      return service.listAllForFunction(input);
    }),
});
