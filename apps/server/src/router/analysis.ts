import { reanalyzeInputSchema } from '@cw/shared';
import { runCodebaseAnalysis } from '../analysis/run.ts';
import { router, scopedProcedure } from './trpc.ts';

export const analysisRouter = router({
  run: scopedProcedure.input(reanalyzeInputSchema).mutation(async ({ ctx }) => {
    const controller = new AbortController();
    ctx.session.setAnalysisController(controller);
    const { summary } = await runCodebaseAnalysis(
      {
        codebase: ctx.codebase,
        llmClient: ctx.llmClient,
        signal: controller.signal,
        now: ctx.now,
      },
      { logger: ctx.logger },
    );
    return summary;
  }),

  cancel: scopedProcedure.mutation(({ ctx }) => {
    ctx.session.cancelCurrentAnalysis();
    return { ok: true };
  }),
});
