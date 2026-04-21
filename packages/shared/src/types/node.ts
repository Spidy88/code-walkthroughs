export type NodeIdentity = string;

export type AnalyzedFile = {
  readonly projectId: string;
  readonly path: string;
  readonly contentHash: string;
  readonly language: string;
  readonly size: number;
  readonly analyzedAt: string;
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
};
