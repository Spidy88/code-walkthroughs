export const builtinClassifications = [
  'route_handler',
  'service',
  'client',
  'repository',
  'helper',
  'middleware',
  'component',
  'page',
  'hook',
  'config',
  'script',
  'seed',
  'fixture',
  'test',
  'type_only',
  'unclassified',
] as const;

export type BuiltinClassification = (typeof builtinClassifications)[number];

export type Classification = BuiltinClassification | (string & { readonly __brand?: 'custom' });

export const confidenceLevels = ['high', 'medium', 'low', 'none'] as const;
export type Confidence = (typeof confidenceLevels)[number];

export const classificationSources = ['stage1', 'stage2', 'prep'] as const;
export type ClassificationSource = (typeof classificationSources)[number];

export type ClassifiedNode = {
  readonly nodeIdentity: string;
  readonly classification: Classification;
  readonly confidence: Confidence;
  readonly source: ClassificationSource;
  readonly justification: string | null;
};
