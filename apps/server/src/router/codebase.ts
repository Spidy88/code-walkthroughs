import { openCodebaseInputSchema, setLabelInputSchema } from '@cw/shared';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { CodebaseOpenError, openCodebase } from '../codebase/open.ts';
import { baseProcedure, router } from './trpc.ts';

export const codebaseRouter = router({
  listRecent: baseProcedure.query(async ({ ctx }) => {
    return ctx.registry.list();
  }),

  open: baseProcedure.input(openCodebaseInputSchema).mutation(async ({ ctx, input }) => {
    try {
      const opened = await openCodebase(
        { path: input.path, now: ctx.now },
        { dataPaths: ctx.dataPaths, registry: ctx.registry, logger: ctx.logger },
      );
      ctx.session.setActive(opened);
      return {
        hash: opened.hash,
        absolutePath: opened.absolutePath,
        name: opened.name,
        label: opened.label,
      };
    } catch (err) {
      if (err instanceof CodebaseOpenError) {
        throw new TRPCError({
          code: err.code === 'CODEBASE_NOT_FOUND' ? 'NOT_FOUND' : 'BAD_REQUEST',
          message: err.message,
        });
      }
      throw err;
    }
  }),

  switch: baseProcedure
    .input(z.object({ hash: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.registry.findByHash(input.hash);
      if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'unknown codebase' });
      const opened = await openCodebase(
        { path: row.absolutePath, now: ctx.now },
        { dataPaths: ctx.dataPaths, registry: ctx.registry, logger: ctx.logger },
      );
      ctx.session.setActive(opened);
      return { hash: opened.hash };
    }),

  close: baseProcedure.mutation(async ({ ctx }) => {
    ctx.session.clear();
    return { ok: true };
  }),

  setLabel: baseProcedure.input(setLabelInputSchema).mutation(async ({ ctx, input }) => {
    await ctx.registry.setLabel(input.hash, input.label);
    return { ok: true };
  }),

  forget: baseProcedure
    .input(z.object({ hash: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const active = ctx.session.getActive();
      if (active?.hash === input.hash) ctx.session.clear();
      await ctx.registry.remove(input.hash);
      return { ok: true };
    }),
});
