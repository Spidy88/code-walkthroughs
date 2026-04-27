import { createRuleInputSchema } from '@cw/shared';
import { z } from 'zod';
import { createRuleService } from '../rules/service.ts';
import { router, scopedProcedure } from './trpc.ts';

export const ruleRouter = router({
  list: scopedProcedure.query(async ({ ctx }) => {
    const svc = createRuleService(ctx.codebase.dbs.state);
    return svc.list();
  }),

  create: scopedProcedure.input(createRuleInputSchema).mutation(async ({ ctx, input }) => {
    const svc = createRuleService(ctx.codebase.dbs.state);
    return svc.create({
      classification: input.classification,
      title: input.title,
      definition: input.definition,
      enabled: input.enabled,
      now: ctx.now(),
    });
  }),

  update: scopedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(200).optional(),
        definition: z.unknown().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const svc = createRuleService(ctx.codebase.dbs.state);
      const update: Parameters<typeof svc.update>[0] = { id: input.id, now: ctx.now() };
      if (input.title !== undefined) update.title = input.title;
      if (input.definition !== undefined) update.definition = input.definition;
      if (input.enabled !== undefined) update.enabled = input.enabled;
      return svc.update(update);
    }),

  remove: scopedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const svc = createRuleService(ctx.codebase.dbs.state);
      return svc.remove(input.id);
    }),
});
