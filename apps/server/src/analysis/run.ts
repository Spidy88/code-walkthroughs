import { basename } from 'node:path';
import { jsTsAdapter } from '@cw/adapters';
import { type AnalysisOutput, runAnalysis } from '@cw/analyzer';
import type { CodebaseId, ProjectMeta } from '@cw/shared';
import type { OpenedCodebase } from '../codebase/open.ts';
import type { LlmClient } from '../llm/client.ts';
import { createAnalyzerCallbacks } from '../llm/pipelines.ts';
import type { Logger } from '../logger.ts';
import { collectJsTsFiles } from './filesystem.ts';
import { persistAnalysis } from './persist.ts';

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

export async function runCodebaseAnalysis(
  input: {
    readonly codebase: OpenedCodebase;
    readonly llmClient: LlmClient;
    readonly signal: AbortSignal;
    readonly now?: () => Date;
  },
  deps: { readonly logger: Logger },
): Promise<{ output: AnalysisOutput; summary: AnalysisRunSummary }> {
  const { codebase, llmClient, signal } = input;
  const now = input.now ?? (() => new Date());

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
  const collected = await collectJsTsFiles(codebase.absolutePath, codebase.git, signal);
  log.info({ fileCount: collected.length }, 'files collected');

  const analyzerCallbacks = createAnalyzerCallbacks(llmClient);

  const output = await runAnalysis(jsTsAdapter, {
    project,
    files: collected.map((f) => ({ filePath: f.filePath, content: f.content })),
    llm: analyzerCallbacks,
    signal,
  });

  await persistAnalysis(codebase.dbs.cache, project.id, output, collected, now());

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
  return { output, summary };
}
