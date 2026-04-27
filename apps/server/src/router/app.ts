import { baseProcedure, router } from './trpc.ts';

export const appRouter = router({
  status: baseProcedure.query(async ({ ctx }) => {
    const active = ctx.session.getActive();
    const isGitRepo = active ? await active.git.isRepo() : false;
    return {
      llmEnabled: ctx.llmClient.enabled,
      active: active
        ? {
            hash: active.hash,
            absolutePath: active.absolutePath,
            label: active.label,
            name: active.name,
            // Walkthrough flows work either way; comparison mode
            // requires a git repo (chunk 23). UI greys out the
            // COMPARISON link when this is false.
            isGitRepo,
          }
        : null,
    };
  }),
});
