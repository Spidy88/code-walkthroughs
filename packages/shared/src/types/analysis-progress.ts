/**
 * Coarse-grained progress for the active codebase's analysis run.
 *
 * The pipeline has finer stages (parse / classify / detect entries / detect
 * paths) but for v1 progress UX we surface only the user-facing milestones:
 *
 *   idle        → no analysis has been triggered yet
 *   collecting  → reading tracked files off disk
 *   analyzing   → parsing + classifying + detecting entries + paths
 *   persisting  → writing results to cache.db
 *   completed   → run finished successfully (summary attached)
 *   failed      → run errored (error attached)
 *   cancelled   → run was aborted via analysis.cancel
 *
 * State transitions are monotonic forward through {idle → collecting →
 * analyzing → persisting → completed | failed | cancelled}; a new run
 * resets to {collecting} (history is not retained on this state — the DB
 * is the source of truth for past runs).
 */
export type AnalysisStage =
  | 'idle'
  | 'collecting'
  | 'analyzing'
  | 'persisting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AnalysisRunSummary = {
  readonly projectId: string;
  readonly fileCount: number;
  readonly classificationCount: number;
  readonly entryPointCount: number;
  readonly pathCount: number;
  readonly prepQuestionCount: number;
  readonly llmEnabled: boolean;
  readonly durationMs: number;
};

export type AnalysisProgress = {
  readonly stage: AnalysisStage;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly fileCount: number | null;
  readonly summary: AnalysisRunSummary | null;
  readonly error: string | null;
};

export const IDLE_PROGRESS: AnalysisProgress = {
  stage: 'idle',
  startedAt: null,
  endedAt: null,
  fileCount: null,
  summary: null,
  error: null,
};
