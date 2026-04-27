import { execa } from 'execa';
import type { Logger } from '../logger.ts';

export type Git = {
  isRepo(): Promise<boolean>;
  revParse(ref: string): Promise<string | null>;
  listTrackedFiles(): Promise<readonly string[]>;
  diffNameStatus(
    baseRef: string,
    headRef: string,
  ): Promise<
    readonly { readonly status: string; readonly path: string; readonly oldPath?: string }[]
  >;
  /**
   * List the file paths in the given ref's tree. Used by comparison
   * mode to materialise (base, head) without checking out a worktree.
   */
  listFilesAtRef(ref: string): Promise<readonly string[]>;
  /**
   * Read one file's content at the given ref. Returns null when the
   * file doesn't exist at that ref (e.g. `git show base:src/foo.ts`
   * for a file that's only in head).
   */
  readFileAtRef(ref: string, path: string): Promise<string | null>;
};

export function createGit(cwd: string, logger: Logger): Git {
  const log = logger.child({ component: 'git', cwd });

  async function run(args: readonly string[]): Promise<string> {
    const result = await execa('git', args, { cwd, reject: false });
    if (result.exitCode !== 0) {
      log.debug({ args, stderr: result.stderr }, 'git command failed');
      throw new GitError(`git ${args.join(' ')} failed: ${result.stderr}`);
    }
    return result.stdout;
  }

  return {
    async isRepo() {
      try {
        const result = await execa('git', ['rev-parse', '--is-inside-work-tree'], {
          cwd,
          reject: false,
        });
        return result.exitCode === 0 && result.stdout.trim() === 'true';
      } catch {
        return false;
      }
    },
    async revParse(ref) {
      const result = await execa('git', ['rev-parse', '--verify', ref], {
        cwd,
        reject: false,
      });
      if (result.exitCode !== 0) return null;
      return result.stdout.trim();
    },
    async listTrackedFiles() {
      const out = await run(['ls-files']);
      return out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    },
    async diffNameStatus(baseRef, headRef) {
      const out = await run(['diff', '--name-status', '-M', `${baseRef}..${headRef}`]);
      return out
        .split('\n')
        .map((line) => line.trim())
        .filter((l) => l.length > 0)
        .map((line) => {
          const parts = line.split('\t');
          const rawStatus = parts[0] ?? '';
          const status = rawStatus.charAt(0);
          if ((status === 'R' || status === 'C') && parts.length >= 3) {
            return { status, oldPath: parts[1] ?? '', path: parts[2] ?? '' };
          }
          return { status, path: parts[1] ?? '' };
        });
    },
    async listFilesAtRef(ref) {
      const out = await run(['ls-tree', '-r', '--name-only', ref]);
      return out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
    },
    async readFileAtRef(ref, path) {
      // Use `git show <ref>:<path>`. Non-existent files exit with
      // code 128 — return null rather than throwing so the caller
      // can map "file added in head" / "file removed in base" cases.
      const result = await execa('git', ['show', `${ref}:${path}`], {
        cwd,
        reject: false,
        // Ensure we get raw bytes; git show otherwise applies its
        // text-conversion config which could strip BOMs etc.
        encoding: 'utf8',
      });
      if (result.exitCode !== 0) return null;
      return result.stdout;
    },
  };
}

export class GitError extends Error {
  readonly code = 'GIT_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'GitError';
  }
}
