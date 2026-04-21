import { baseProcedure, router } from './trpc.ts';

export const appRouter = router({
  status: baseProcedure.query(({ ctx }) => {
    const active = ctx.session.getActive();
    return {
      llmEnabled: ctx.llmClient.enabled,
      active: active
        ? {
            hash: active.hash,
            absolutePath: active.absolutePath,
            label: active.label,
            name: active.name,
          }
        : null,
    };
  }),
});
