export type NodeIdentity = string;

export type AnalyzedFile = {
  readonly projectId: string;
  readonly path: string;
  readonly contentHash: string;
  readonly language: string;
  readonly size: number;
  readonly analyzedAt: string;
};

/**
 * Function-shape signature, extracted by the language adapter at
 * parse time. The string form is intentionally cheap-to-diff:
 * comparison code joins / splits / hashes these strings without
 * caring how they were produced. Adapters for other languages
 * populate this however they like.
 */
export type FunctionSignature = {
  readonly params: readonly string[];
  readonly returnType: string;
};

export type AnalyzedNode = {
  readonly identity: NodeIdentity;
  readonly filePath: string;
  readonly projectId: string;
  readonly kind: 'function' | 'file' | 'component';
  readonly name: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly exported: boolean;
  readonly contentHash: string;
  /**
   * Optional — present only for kind='function' / 'component' when
   * the adapter could resolve types. File-level pseudo-nodes don't
   * have a signature.
   */
  readonly signature?: FunctionSignature;
};
