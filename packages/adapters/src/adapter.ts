import type {
  AnalyzedFile,
  AnalyzedNode,
  Classification,
  Confidence,
  EntryPoint,
  NodeIdentity,
  ProjectMeta,
} from '@cw/shared';

export type ParseInput = {
  readonly projectId: string;
  readonly filePath: string;
  readonly content: string;
};

export type CallEdge = {
  readonly callerIdentity: NodeIdentity;
  readonly callSite: { readonly line: number; readonly column: number };
  readonly calleeIdentity: NodeIdentity | null;
  readonly unresolved: boolean;
  readonly unresolvedHint?: string;
};

export type ParseOutput = {
  readonly file: AnalyzedFile;
  readonly nodes: readonly AnalyzedNode[];
  readonly imports: readonly {
    readonly from: string;
    readonly specifiers: readonly string[];
  }[];
  readonly exports: readonly {
    readonly name: string;
    readonly nodeIdentity: NodeIdentity | null;
  }[];
  readonly callEdges: readonly CallEdge[];
};

export type ClassifierSignal = {
  readonly name: string;
  readonly weight: 'high' | 'medium' | 'low';
  readonly kind: 'path-pattern' | 'filename-pattern' | 'ast-marker' | 'import-based';
  readonly match: (input: SignalInput) => SignalMatchResult | null;
};

export type SignalInput = {
  readonly project: ProjectMeta;
  readonly parsed: ParseOutput;
  readonly relativePath: string;
};

export type SignalMatchResult = {
  readonly classification: Classification;
  readonly note?: string;
};

export type FrameworkAdapter = {
  readonly name: string;
  detect(project: ProjectMeta, parsed: readonly ParseOutput[]): boolean;
  detectEntryPoints(input: FrameworkEntryPointInput): readonly EntryPoint[];
  readonly classifierSignals: readonly ClassifierSignal[];
};

export type FrameworkEntryPointInput = {
  readonly project: ProjectMeta;
  readonly files: readonly ParseOutput[];
};

export type LanguageAdapter = {
  readonly language: string;
  detect(project: ProjectMeta): boolean;
  parseFile(input: ParseInput): ParseOutput;
  readonly classifierSignals: readonly ClassifierSignal[];
  readonly frameworkAdapters: readonly FrameworkAdapter[];
};

export type AggregatedClassification = {
  readonly classification: Classification;
  readonly confidence: Confidence;
  readonly contributingSignals: readonly string[];
  readonly conflicting: boolean;
};
