export type CodebaseId = string & { readonly __brand: 'CodebaseId' };

export type Codebase = {
  readonly id: CodebaseId;
  readonly hash: string;
  readonly absolutePath: string;
  readonly label: string | null;
  readonly lastOpenedAt: string;
  readonly createdAt: string;
};

export type ProjectMeta = {
  readonly id: string;
  readonly codebaseId: CodebaseId;
  readonly name: string;
  readonly rootPath: string;
  readonly language: string;
  readonly frameworks: readonly string[];
  readonly walkable: boolean;
};
