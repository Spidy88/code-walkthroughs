import { existsSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { CodebaseId } from '@cw/shared';
import { type CodebaseDbs, openCodebaseDbs } from '../db/codebase.ts';
import { type Git, createGit } from '../git/git.ts';
import type { Logger } from '../logger.ts';
import { type DataPaths, codebaseCacheDbPath, codebaseStateDbPath } from '../paths.ts';
import { hashCodebasePath } from './hash.ts';
import type { CodebaseRegistry } from './registry.ts';

export type OpenedCodebase = {
  readonly id: CodebaseId;
  readonly hash: string;
  readonly absolutePath: string;
  readonly name: string;
  readonly label: string | null;
  readonly dbs: CodebaseDbs;
  readonly git: Git;
  close(): void;
};

export class CodebaseOpenError extends Error {
  readonly code: 'CODEBASE_NOT_FOUND' | 'CODEBASE_NOT_DIRECTORY';
  constructor(code: 'CODEBASE_NOT_FOUND' | 'CODEBASE_NOT_DIRECTORY', message: string) {
    super(message);
    this.code = code;
    this.name = 'CodebaseOpenError';
  }
}

export async function openCodebase(
  input: { readonly path: string; readonly now?: () => Date },
  deps: {
    readonly dataPaths: DataPaths;
    readonly registry: CodebaseRegistry;
    readonly logger: Logger;
  },
): Promise<OpenedCodebase> {
  const absolutePath = resolve(input.path);
  if (!existsSync(absolutePath)) {
    throw new CodebaseOpenError('CODEBASE_NOT_FOUND', `no such path: ${absolutePath}`);
  }
  const stat = statSync(absolutePath);
  if (!stat.isDirectory()) {
    throw new CodebaseOpenError('CODEBASE_NOT_DIRECTORY', `not a directory: ${absolutePath}`);
  }

  const hash = hashCodebasePath(absolutePath);
  const now = input.now ?? (() => new Date());

  const dbs = openCodebaseDbs({
    stateDbPath: codebaseStateDbPath(deps.dataPaths, hash),
    cacheDbPath: codebaseCacheDbPath(deps.dataPaths, hash),
  });

  const row = await deps.registry.touch({ hash, absolutePath, now: now() });
  const git = createGit(absolutePath, deps.logger);

  return {
    id: hash as CodebaseId,
    hash,
    absolutePath,
    name: basename(absolutePath),
    label: row.label,
    dbs,
    git,
    close() {
      dbs.close();
    },
  };
}
