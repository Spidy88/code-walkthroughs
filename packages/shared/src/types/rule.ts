import type { Classification } from './classification.ts';

export const ruleTiers = ['builtin', 'shell', 'llm'] as const;
export type RuleTier = (typeof ruleTiers)[number];

export const ruleScopes = ['user', 'project'] as const;
export type RuleScope = (typeof ruleScopes)[number];

export type RuleDefinition =
  | {
      readonly tier: 'builtin';
      readonly name: string;
      readonly options?: Readonly<Record<string, unknown>>;
    }
  | { readonly tier: 'shell'; readonly command: string; readonly timeoutMs?: number }
  | { readonly tier: 'llm'; readonly promptTemplate: string; readonly model?: string };

export type Rule = {
  readonly id: string;
  readonly scope: RuleScope;
  readonly classification: Classification;
  readonly title: string;
  readonly definition: RuleDefinition;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export const ruleResultKinds = ['pass', 'fail', 'skip', 'unchecked'] as const;
export type RuleResultKind = (typeof ruleResultKinds)[number];

export type RuleResult = {
  readonly ruleId: string;
  readonly nodeIdentity: string;
  readonly kind: RuleResultKind;
  readonly message: string | null;
  readonly evaluatedAt: string;
};
