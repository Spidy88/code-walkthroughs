import type { Classification, Confidence } from './classification.ts';

export const prepQuestionKinds = [
  'classification',
  'path_branch',
  'entry_point',
  'intent',
  'rename',
] as const;
export type PrepQuestionKind = (typeof prepQuestionKinds)[number];

export type PrepSuggestion = {
  readonly value: string;
  readonly label: string;
  readonly confidence: Confidence;
  readonly justification: string | null;
};

export type PrepContext =
  | {
      readonly kind: 'classification';
      readonly filePath: string;
      readonly nodeIdentity: string;
      readonly stage1Candidate: Classification | null;
      readonly stage2Candidate: Classification | null;
    }
  | {
      readonly kind: 'path_branch';
      readonly pathId: string;
      readonly callerIdentity: string;
      readonly candidates: readonly string[];
    }
  | { readonly kind: 'entry_point'; readonly projectId: string; readonly detectedCount: number }
  | { readonly kind: 'intent'; readonly nodeIdentity: string }
  | {
      readonly kind: 'rename';
      readonly oldIdentity: string;
      readonly newIdentity: string;
      readonly similarity: number;
    };

export type PrepQuestion = {
  readonly key: string;
  readonly kind: PrepQuestionKind;
  readonly context: PrepContext;
  readonly suggestion: PrepSuggestion | null;
  readonly alternatives: readonly PrepSuggestion[];
  readonly createdAt: string;
};

export type PrepAnswer = {
  readonly questionKey: string;
  readonly kind: PrepQuestionKind;
  readonly answer: unknown;
  readonly answeredAt: string;
};
