// Types
export type {
  BuiltinClassification,
  Classification,
  ClassificationSource,
  ClassifiedNode,
  Confidence,
} from './types/classification.ts';
export {
  builtinClassifications,
  classificationSources,
  confidenceLevels,
} from './types/classification.ts';

export type { Codebase, CodebaseId, ProjectMeta } from './types/codebase.ts';

export type {
  AnalysisProgress,
  AnalysisRunSummary,
  AnalysisStage,
} from './types/analysis-progress.ts';
export { IDLE_PROGRESS } from './types/analysis-progress.ts';

export type { AnalyzedFile, AnalyzedNode, NodeIdentity } from './types/node.ts';
export {
  contractChangeKinds,
  pathDeltaClassifications,
} from './types/comparison.ts';
export type {
  AffectedCaller,
  ComparisonDelta,
  ContractChange,
  ContractChangeKind,
  IndirectImpactPath,
  NodeSignature,
  PathDelta,
  PathDeltaClassification,
} from './types/comparison.ts';

export type {
  DetectedPath,
  EntryPoint,
  EntryPointId,
  EntryPointKind,
  PathId,
  PathNode,
  Preamble,
  PreambleNode,
  PreambleRole,
} from './types/path.ts';
export { entryPointKinds, preambleRoles } from './types/path.ts';

export type {
  Comment,
  CommentAnchor,
  CommentAnchorKind,
  NodeRuntimeState,
  ReviewHistoryRow,
  ReviewStatus,
  ReviewStatusRow,
  StatusScope,
} from './types/review.ts';
export { commentAnchorKinds, reviewStatuses } from './types/review.ts';

export type {
  Rule,
  RuleDefinition,
  RuleResult,
  RuleResultKind,
  RuleScope,
  RuleTier,
} from './types/rule.ts';
export { ruleResultKinds, ruleScopes, ruleTiers } from './types/rule.ts';

export type {
  PrepAnswer,
  PrepContext,
  PrepQuestion,
  PrepQuestionKind,
  PrepSuggestion,
} from './types/prep.ts';
export { prepQuestionKinds } from './types/prep.ts';

// Schemas
export {
  classificationSchema,
  classificationSourceSchema,
  classifiedNodeSchema,
  confidenceSchema,
} from './schemas/classification.ts';

export type {
  AddCommentInput,
  ClearStatusInput,
  DeleteCommentInput,
  ListCommentsInput,
  ListFunctionCommentsInput,
  PromoteScopedApprovalInput,
  SetFileStatusInput,
  SetStatusInput,
  UpdateCommentInput,
} from './schemas/review.ts';
export {
  addCommentInputSchema,
  clearStatusInputSchema,
  commentAnchorKindSchema,
  commentAnchorSchema,
  deleteCommentInputSchema,
  fileCascadeResolutionSchema,
  listCommentsInputSchema,
  listFunctionCommentsInputSchema,
  promoteScopedApprovalInputSchema,
  reviewStatusSchema,
  setFileStatusInputSchema,
  setStatusInputSchema,
  statusScopeSchema,
  updateCommentInputSchema,
} from './schemas/review.ts';

export type {
  AnswerPrepQuestionInput,
  GetPrepQuestionInput,
  ListForPathInput,
  ListPrepQuestionsInput,
} from './schemas/prep.ts';
export {
  answerPrepQuestionInputSchema,
  getPrepQuestionInputSchema,
  listForPathInputSchema,
  listPrepQuestionsInputSchema,
  prepAnswerPayloadSchema,
  prepQuestionKindSchema,
} from './schemas/prep.ts';

export type { CreateRuleInput } from './schemas/rule.ts';
export {
  createRuleInputSchema,
  ruleDefinitionSchema,
  ruleResultKindSchema,
  ruleScopeSchema,
  ruleSchema,
  ruleTierSchema,
  shellRuleIoSchema,
  shellRuleResponseSchema,
} from './schemas/rule.ts';

export type {
  OpenCodebaseInput,
  ReanalyzeInput,
  SetComparisonInput,
  SetLabelInput,
} from './schemas/codebase.ts';
export {
  openCodebaseInputSchema,
  reanalyzeInputSchema,
  setComparisonInputSchema,
  setLabelInputSchema,
} from './schemas/codebase.ts';

// Utilities
export { canonicalJson, hashCanonical, sha256 } from './util/hash.ts';
export { ulid } from './util/ids.ts';
export type { Err, Ok, Result } from './util/result.ts';
export { err, isErr, isOk, ok } from './util/result.ts';
