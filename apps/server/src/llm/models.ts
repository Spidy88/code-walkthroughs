/**
 * Model assignment per pipeline. Decided in chunk 21:
 *   - Opus for the few low-volume, high-reasoning calls (path
 *     categorisation needs to actually understand each path; fix
 *     suggestions are reviewer-facing and benefit from depth).
 *   - Sonnet for mid-volume, mid-reasoning (architectural pass,
 *     branch resolution at forks, prep suggestions, LLM-rule
 *     default).
 *   - Haiku for the high-volume, low-brain stage 2 classification —
 *     one call per low-confidence file, easily thousands per
 *     codebase. Cost dominates; depth doesn't.
 *
 * Model IDs follow Claude 4.x naming. Reviewer can override the
 * LLM-rule model per rule definition (chunk 16); everything else is
 * fixed defaults so behaviour is reproducible.
 */
export const llmModels = {
  architecturalPass: 'claude-sonnet-4-6',
  classifyStage2: 'claude-haiku-4-5-20251001',
  pathInference: 'claude-sonnet-4-6',
  pathCategorization: 'claude-opus-4-7',
  prepSuggestion: 'claude-sonnet-4-6',
  ruleEvaluation: 'claude-sonnet-4-6',
  fixSuggestion: 'claude-opus-4-7',
} as const;

export type LlmPipelineName = keyof typeof llmModels;

export const pipelineNames: readonly LlmPipelineName[] = Object.keys(
  llmModels,
) as LlmPipelineName[];
