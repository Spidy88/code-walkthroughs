import type { ParseOutput } from '@cw/adapters';
import type {
  AnalyzedFile,
  AnalyzedNode,
  Classification,
  Confidence,
  DetectedPath,
  EntryPoint,
  PathNode,
  PrepQuestion,
  ProjectMeta,
  RuleResult,
} from '@cw/shared';

export type AnalysisLlmCallback = {
  /**
   * If null, LLM features are disabled. Analyzer stages degrade gracefully.
   */
  readonly architecturalPass?: (
    input: ArchitecturalPassInput,
  ) => Promise<ArchitecturalHints | null>;
  readonly classifyStage2?: (input: Stage2Input) => Promise<Stage2Response | null>;
  readonly resolveBranch?: (input: BranchResolutionInput) => Promise<BranchResolution | null>;
  readonly generatePrepSuggestion?: (
    input: PrepSuggestionInput,
  ) => Promise<PrepSuggestionResponse | null>;
};

export type ArchitecturalPassInput = {
  readonly project: ProjectMeta;
  readonly paths: readonly string[];
  readonly rootPackageJson: unknown;
};

export type ArchitecturalHints = {
  readonly layoutConvention: 'layered' | 'feature-based' | 'ddd' | 'ad-hoc' | 'unknown';
  readonly likelyFrameworks: readonly string[];
  readonly notes: string;
};

export type Stage2Input = {
  readonly file: AnalyzedFile;
  readonly content: string;
  readonly stage1: {
    readonly classification: Classification;
    readonly confidence: Confidence;
  };
  readonly hints: ArchitecturalHints | null;
};

export type Stage2Response = {
  readonly classification: Classification;
  readonly confidence: Confidence;
  readonly justification: string;
};

export type BranchResolutionInput = {
  readonly callerIdentity: string;
  readonly fileContent: string;
  readonly candidates: readonly string[];
};

export type BranchResolution = {
  readonly chosen: string;
  readonly confidence: Confidence;
  readonly justification: string;
};

export type PrepSuggestionInput = {
  readonly question: PrepQuestion;
  readonly relevantContent: string;
};

export type PrepSuggestionResponse = {
  readonly suggestion: PrepQuestion['suggestion'];
  readonly alternatives: PrepQuestion['alternatives'];
};

export type AnalysisInput = {
  readonly project: ProjectMeta;
  readonly files: readonly {
    readonly filePath: string;
    readonly content: string;
  }[];
  readonly llm?: AnalysisLlmCallback;
  readonly signal?: AbortSignal;
  /**
   * Reviewer-supplied path_branch answers from prior runs, keyed by
   * `branchKey(entryNodeIdentity, callerIdentity)` (see paths/detect.ts).
   * Path detection consults these to pick the chosen callee instead
   * of defaulting to the first resolvable one.
   */
  readonly branchAnswers?: ReadonlyMap<string, string>;
  /**
   * Snapshot of the analyzed_nodes table from the prior run. Lets
   * detectRenameCandidates pair a removed-from-cache identity with a
   * newly-added identity in the same file when their names look
   * similar enough.
   */
  readonly priorAnalyzedNodes?: ReadonlyArray<{
    readonly nodeIdentity: string;
    readonly filePath: string;
    readonly name: string;
    readonly kind: string;
  }>;
};

export type AnalysisOutput = {
  readonly project: ProjectMeta;
  readonly parsedFiles: readonly ParseOutput[];
  readonly classifications: readonly ClassificationResult[];
  readonly entryPoints: readonly EntryPoint[];
  readonly paths: readonly DetectedPath[];
  readonly pathNodes: readonly PathNode[];
  readonly prepQuestions: readonly PrepQuestion[];
  readonly architecturalHints: ArchitecturalHints | null;
  readonly ruleResults: readonly RuleResult[];
};

export type ClassificationResult = {
  readonly nodeIdentity: string;
  readonly filePath: string;
  readonly classification: Classification;
  readonly confidence: Confidence;
  readonly source: 'stage1' | 'stage2' | 'prep';
  readonly contributingSignals: readonly string[];
  readonly conflicting: boolean;
  readonly justification: string | null;
  readonly contentHash: string;
};

export type { AnalyzedFile, AnalyzedNode, ParseOutput };
