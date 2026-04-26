import { basename } from 'node:path';
import { jsTsAdapter } from '@cw/adapters';
import { type AnalysisOutput, runAnalysis } from '@cw/analyzer';
import type { AnalysisRunSummary, AnalysisStage, CodebaseId, ProjectMeta } from '@cw/shared';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { OpenedCodebase } from '../codebase/open.ts';
import { comments } from '../db/schema/state/comments.ts';
import { prepAnswers } from '../db/schema/state/prep-answers.ts';
import type { LlmClient } from '../llm/client.ts';
import { createAnalyzerCallbacks } from '../llm/pipelines.ts';
import type { Logger } from '../logger.ts';
import { collectJsTsFiles } from './filesystem.ts';
import { persistAnalysis } from './persist.ts';

export type { AnalysisRunSummary };

export type AnalysisProgressUpdate = {
  readonly stage: AnalysisStage;
  readonly fileCount?: number;
  readonly summary?: AnalysisRunSummary;
  readonly error?: string;
};

export async function runCodebaseAnalysis(
  input: {
    readonly codebase: OpenedCodebase;
    readonly llmClient: LlmClient;
    readonly signal: AbortSignal;
    readonly now?: () => Date;
    readonly onProgress?: (update: AnalysisProgressUpdate) => void;
  },
  deps: { readonly logger: Logger },
): Promise<{ output: AnalysisOutput; summary: AnalysisRunSummary }> {
  const { codebase, llmClient, signal, onProgress } = input;
  const now = input.now ?? (() => new Date());
  const emit = (update: AnalysisProgressUpdate) => onProgress?.(update);

  const log = deps.logger.child({ component: 'analysis', codebase: codebase.hash });
  const started = Date.now();

  const project: ProjectMeta = {
    id: codebase.hash,
    codebaseId: codebase.hash as CodebaseId,
    name: codebase.label ?? basename(codebase.absolutePath),
    rootPath: codebase.absolutePath,
    language: 'javascript',
    frameworks: [],
    walkable: true,
  };

  log.info('analysis starting');
  emit({ stage: 'collecting' });

  const collected = await collectJsTsFiles(codebase.absolutePath, codebase.git, signal);
  log.info({ fileCount: collected.length }, 'files collected');
  emit({ stage: 'analyzing', fileCount: collected.length });

  const analyzerCallbacks = createAnalyzerCallbacks(llmClient);

  // Load any prior path_branch answers and feed them in so the
  // analyzer honours the reviewer's chosen branch rather than the
  // default first-resolvable callee. (Stage 9B: classification
  // answers feed back via the cache row, branch answers feed back
  // here.)
  const branchAnswers = await loadBranchAnswers(codebase);

  const output = await runAnalysis(jsTsAdapter, {
    project,
    files: collected.map((f) => ({ filePath: f.filePath, content: f.content })),
    llm: analyzerCallbacks,
    signal,
    branchAnswers,
  });

  emit({ stage: 'persisting', fileCount: collected.length });
  await persistAnalysis(codebase.dbs.cache, project.id, output, collected, now());

  // Spec §13 — orphaned-comment handling. After re-analysis, any
  // comment whose anchor function/file no longer exists in the
  // freshly persisted cache.db gets soft-archived. The reviewer can
  // still find them under "show archived" but they no longer clutter
  // the active surface.
  await archiveOrphanedComments(codebase, output, now());

  const summary: AnalysisRunSummary = {
    projectId: project.id,
    fileCount: collected.length,
    classificationCount: output.classifications.length,
    entryPointCount: output.entryPoints.length,
    pathCount: output.paths.length,
    prepQuestionCount: output.prepQuestions.length,
    llmEnabled: llmClient.enabled,
    durationMs: Date.now() - started,
  };
  log.info(summary, 'analysis complete');
  emit({ stage: 'completed', fileCount: collected.length, summary });
  return { output, summary };
}

async function archiveOrphanedComments(
  codebase: OpenedCodebase,
  output: AnalysisOutput,
  now: Date,
): Promise<void> {
  const aliveFilePaths = new Set(output.parsedFiles.map((p) => p.file.path));
  const aliveFunctionIdentities = new Set(
    output.parsedFiles.flatMap((p) => p.nodes.map((n) => n.identity)),
  );
  const ts = now.toISOString();
  // Two narrow passes:
  //  1) Function-anchored or line-anchored rows whose function
  //     identity is gone → archived.
  //  2) File-anchored rows whose file is gone → archived.
  if (aliveFunctionIdentities.size > 0) {
    await codebase.dbs.state
      .update(comments)
      .set({ archivedAt: ts, updatedAt: ts })
      .where(
        and(
          isNull(comments.archivedAt),
          notInArray(comments.functionIdentity, [...aliveFunctionIdentities]),
        ),
      );
  }
  if (aliveFilePaths.size > 0) {
    await codebase.dbs.state
      .update(comments)
      .set({ archivedAt: ts, updatedAt: ts })
      .where(and(isNull(comments.archivedAt), notInArray(comments.filePath, [...aliveFilePaths])));
  }
}

async function loadBranchAnswers(codebase: OpenedCodebase): Promise<Map<string, string>> {
  const rows = await codebase.dbs.state
    .select()
    .from(prepAnswers)
    .where(eq(prepAnswers.questionKind, 'path_branch'));
  const map = new Map<string, string>();
  for (const row of rows) {
    const a = row.answer as { kind?: string; chosenIdentity?: string };
    if (a?.kind === 'path_branch' && typeof a.chosenIdentity === 'string') {
      map.set(row.questionKey, a.chosenIdentity);
    }
  }
  return map;
}
