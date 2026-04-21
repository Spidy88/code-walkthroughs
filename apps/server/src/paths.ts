import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export type DataPaths = {
  readonly root: string;
  readonly userDbPath: string;
  readonly codebasesDir: string;
};

export function resolveDataPaths(override: string | undefined): DataPaths {
  const root = override ? resolve(override) : join(homedir(), '.code-walkthrough');
  return {
    root,
    userDbPath: join(root, 'config.db'),
    codebasesDir: join(root, 'codebases'),
  };
}

export function codebaseDir(paths: DataPaths, hash: string): string {
  return join(paths.codebasesDir, hash);
}

export function codebaseStateDbPath(paths: DataPaths, hash: string): string {
  return join(codebaseDir(paths, hash), 'state.db');
}

export function codebaseCacheDbPath(paths: DataPaths, hash: string): string {
  return join(codebaseDir(paths, hash), 'cache.db');
}
