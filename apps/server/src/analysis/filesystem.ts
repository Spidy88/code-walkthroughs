import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { Git } from '../git/git.ts';

export type CollectedFile = {
  readonly filePath: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly size: number;
};

const MAX_FILE_BYTES = 512 * 1024;

/** Directories we never descend into when walking a non-git tree. */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.cache',
  '.vite',
]);

/**
 * Collects every JS/TS file under the codebase. Prefers the git
 * tracked-file listing when the directory is a git repo (respects
 * .gitignore for free); falls back to a filesystem walk so codebases
 * that aren't git repos still work for the walkthrough flow. The
 * comparison flow continues to require git — that's its constraint,
 * not the walkthrough's.
 */
export async function collectJsTsFiles(
  rootPath: string,
  git: Git,
  signal?: AbortSignal,
): Promise<readonly CollectedFile[]> {
  const isRepo = await git.isRepo();
  const relPaths = isRepo
    ? await git.listTrackedFiles()
    : walkDirectory(resolve(rootPath), resolve(rootPath));
  const result: CollectedFile[] = [];
  for (const relPath of relPaths) {
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

function walkDirectory(rootPath: string, currentDir: string): string[] {
  const out: string[] = [];
  let entries: import('node:fs').Dirent[] = [];
  try {
    entries = readdirSync(currentDir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const name = String(entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(name)) continue;
      out.push(...walkDirectory(rootPath, resolve(currentDir, name)));
    } else if (entry.isFile()) {
      out.push(relative(rootPath, resolve(currentDir, name)));
    }
  }
  return out;
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
