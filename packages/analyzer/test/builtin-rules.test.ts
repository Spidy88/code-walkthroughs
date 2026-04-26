import { jsTsAdapter } from '@cw/adapters';
import type { ProjectMeta } from '@cw/shared';
import { describe, expect, test } from 'vitest';
import { runAnalysis } from '../src/run.ts';

const project: ProjectMeta = {
  id: 'proj',
  codebaseId: 'cb' as ProjectMeta['codebaseId'],
  name: 'rules-fixture',
  rootPath: '/tmp/rules',
  language: 'typescript',
  frameworks: ['express'],
  walkable: true,
};

// The tests below exercise the rule engine end-to-end via runAnalysis
// — the exact node-level outcomes depend on stage 1 signals being
// strong enough to classify files into the right buckets. We use
// repository-style + route_handler files (the strongest stage-1
// signals) so the fixture is stable.

describe('built-in rules — runAnalysis emits ruleResults', () => {
  test('runs the engine and emits per-node results for classified nodes', async () => {
    // A repo-style data-access file: stage 1 keys on the `db/` path
    // pattern + suffix and classifies as repository, which fires
    // builtin:repository:narrow_data_access.
    const result = await runAnalysis(jsTsAdapter, {
      project,
      files: [
        {
          filePath: 'src/db/userRepo.ts',
          content: `
            export async function findUserById(id: number) { return { id }; }
            export async function findUserByEmail(email: string) { return { email }; }
          `,
        },
      ],
    });
    expect(result.ruleResults.length).toBeGreaterThan(0);
    const repoRule = result.ruleResults.find(
      (r) => r.ruleId === 'builtin:repository:narrow_data_access',
    );
    expect(repoRule).toBeDefined();
    // Rules use 'pass' / 'fail' / 'skip' — never invent a fifth.
    for (const r of result.ruleResults) {
      expect(['pass', 'fail', 'skip', 'unchecked']).toContain(r.kind);
    }
  });
});
