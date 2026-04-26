import { type AnalysisProgress, type AnalysisStage, reanalyzeInputSchema } from '@cw/shared';
import { runCodebaseAnalysis } from '../analysis/run.ts';
import { router, scopedProcedure } from './trpc.ts';

export const analysisRouter = router({
  run: scopedProcedure.input(reanalyzeInputSchema).mutation(async ({ ctx }) => {
    const controller = new AbortController();
    ctx.session.setAnalysisController(controller);

    const startedAt = ctx.now().toISOString();
    ctx.session.setProgress({
      stage: 'collecting',
      startedAt,
      endedAt: null,
      fileCount: null,
      summary: null,
      error: null,
    });

    try {
      const { summary } = await runCodebaseAnalysis(
        {
          codebase: ctx.codebase,
          llmClient: ctx.llmClient,
          signal: controller.signal,
          now: ctx.now,
          onProgress: (update) => {
            const current = ctx.session.getProgress();
            ctx.session.setProgress(mergeProgress(current, update, ctx.now().toISOString()));
          },
        },
        { logger: ctx.logger },
      );
      return summary;
    } catch (error) {
      const isAbort =
        error instanceof Error && (error.name === 'AbortError' || controller.signal.aborted);
      const stage: AnalysisStage = isAbort ? 'cancelled' : 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);
      ctx.session.setProgress({
        ...ctx.session.getProgress(),
        stage,
        endedAt: ctx.now().toISOString(),
        error: isAbort ? null : errorMessage,
      });
      throw error;
    }
  }),

  cancel: scopedProcedure.mutation(({ ctx }) => {
    ctx.session.cancelCurrentAnalysis();
    const current = ctx.session.getProgress();
    if (current.stage !== 'completed' && current.stage !== 'failed') {
      ctx.session.setProgress({
        ...current,
        stage: 'cancelled',
        endedAt: ctx.now().toISOString(),
      });
    }
    return { ok: true };
  }),

  getStatus: scopedProcedure.query(({ ctx }) => {
    return ctx.session.getProgress();
  }),
});

function mergeProgress(
  current: AnalysisProgress,
  update: { stage: AnalysisStage; fileCount?: number; summary?: AnalysisProgress['summary'] },
  nowIso: string,
): AnalysisProgress {
  const isTerminal =
    update.stage === 'completed' || update.stage === 'failed' || update.stage === 'cancelled';
  return {
    stage: update.stage,
    startedAt: current.startedAt ?? nowIso,
    endedAt: isTerminal ? nowIso : current.endedAt,
    fileCount: update.fileCount ?? current.fileCount,
    summary: update.summary ?? current.summary,
    error: null,
  };
}
