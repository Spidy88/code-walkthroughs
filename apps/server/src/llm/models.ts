export const llmModels = {
  architecturalPass: 'claude-opus-4-7',
  classifyStage2: 'claude-haiku-4-5',
  pathInference: 'claude-opus-4-7',
  pathCategorization: 'claude-opus-4-7',
  prepSuggestion: 'claude-haiku-4-5',
  ruleEvaluation: 'claude-haiku-4-5',
  fixSuggestion: 'claude-opus-4-7',
} as const;

export type LlmPipelineName = keyof typeof llmModels;

export const pipelineNames: readonly LlmPipelineName[] = Object.keys(
  llmModels,
) as LlmPipelineName[];
