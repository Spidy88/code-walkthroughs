import { readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Git } from '../git/git.ts';

export type CollectedFile = {
  readonly filePath: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly size: number;
};

const MAX_FILE_BYTES = 512 * 1024;

export async function collectJsTsFiles(
  rootPath: string,
  git: Git,
  signal?: AbortSignal,
): Promise<readonly CollectedFile[]> {
  const tracked = await git.listTrackedFiles();
  const result: CollectedFile[] = [];
  for (const relPath of tracked) {
    signal?.throwIfAborted();
    if (!isJsTs(relPath)) continue;
    const absolutePath = resolve(rootPath, relPath);
    const stat = safeStat(absolutePath);
    if (!stat || !stat.isFile()) continue;
    if (stat.size > MAX_FILE_BYTES) continue;
    const content = readFileSync(absolutePath, 'utf8');
    result.push({
      filePath: relPath,
      absolutePath,
      content,
      size: stat.size,
    });
  }
  return result;
}

function isJsTs(path: string): boolean {
  return /\.(?:[cm]?[jt]sx?)$/i.test(path);
}

function safeStat(absolutePath: string) {
  try {
    return statSync(absolutePath);
  } catch {
    return null;
  }
}

export function toRelative(rootPath: string, absolutePath: string): string {
  return relative(resolve(rootPath), resolve(absolutePath));
}
