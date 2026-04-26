import {
  answerPrepQuestionInputSchema,
  getPrepQuestionInputSchema,
  listForPathInputSchema,
  listPrepQuestionsInputSchema,
} from '@cw/shared';
import { TRPCError } from '@trpc/server';
import { createPrepService } from '../prep/service.ts';
import { router, scopedProcedure } from './trpc.ts';

export const prepRouter = router({
  listQuestions: scopedProcedure
    .input(listPrepQuestionsInputSchema)
    .query(async ({ ctx, input }) => {
      const svc = createPrepService({
        cache: ctx.codebase.dbs.cache,
        state: ctx.codebase.dbs.state,
      });
      return svc.list({ includeAnswered: input.includeAnswered ?? false });
    }),

  listForPath: scopedProcedure.input(listForPathInputSchema).query(async ({ ctx, input }) => {
    const svc = createPrepService({
      cache: ctx.codebase.dbs.cache,
      state: ctx.codebase.dbs.state,
    });
    return svc.listForPath({ pathId: input.pathId });
  }),

  getQuestion: scopedProcedure.input(getPrepQuestionInputSchema).query(async ({ ctx, input }) => {
    const svc = createPrepService({
      cache: ctx.codebase.dbs.cache,
      state: ctx.codebase.dbs.state,
    });
    const q = await svc.get(input.key);
    if (!q) throw new TRPCError({ code: 'NOT_FOUND', message: 'prep question not found' });
    return q;
  }),

  answerQuestion: scopedProcedure
    .input(answerPrepQuestionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const svc = createPrepService({
        cache: ctx.codebase.dbs.cache,
        state: ctx.codebase.dbs.state,
      });
      const result = await svc.answer({
        key: input.key,
        answer: input.answer,
        now: ctx.now(),
      });
      if (!result.answered) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'prep question not found or answer kind mismatched',
        });
      }
      return result;
    }),
});
