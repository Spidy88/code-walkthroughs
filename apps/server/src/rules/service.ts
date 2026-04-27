import { spawn } from 'node:child_process';
import type { RuleResult, RuleResultKind } from '@cw/shared';
import { ulid } from '@cw/shared';
import { eq } from 'drizzle-orm';
import type { StateDb } from '../db/codebase.ts';
import { projectRules } from '../db/schema/state/project-rules.ts';

export type RuleRow = {
  readonly id: string;
  readonly classification: string;
  readonly title: string;
  readonly tier: 'builtin' | 'shell' | 'llm';
  readonly definition: unknown;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type RuleService = {
  list(): Promise<RuleRow[]>;
  create(input: {
    classification: string;
    title: string;
    definition: unknown;
    enabled?: boolean;
    now: Date;
  }): Promise<RuleRow>;
  update(input: {
    id: string;
    title?: string;
    definition?: unknown;
    enabled?: boolean;
    now: Date;
  }): Promise<RuleRow | null>;
  remove(id: string): Promise<{ deleted: boolean }>;
};

function rowToRule(r: typeof projectRules.$inferSelect): RuleRow {
  return {
    id: r.id,
    classification: r.classification,
    title: r.title,
    tier: r.tier as RuleRow['tier'],
    definition: r.definition,
    enabled: r.enabled,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function createRuleService(db: StateDb): RuleService {
  return {
    async list() {
      const rows = await db.select().from(projectRules);
      return rows.map(rowToRule);
    },
    async create(input) {
      const ts = input.now.toISOString();
      const id = ulid();
      const tier =
        (input.definition as { tier?: string } | null)?.tier === 'shell'
          ? 'shell'
          : (input.definition as { tier?: string } | null)?.tier === 'llm'
            ? 'llm'
            : 'builtin';
      await db.insert(projectRules).values({
        id,
        classification: input.classification,
        title: input.title,
        tier,
        definition: input.definition as unknown,
        enabled: input.enabled ?? true,
        createdAt: ts,
        updatedAt: ts,
      });
      const [row] = await db.select().from(projectRules).where(eq(projectRules.id, id));
      if (!row) throw new Error('rule insert succeeded but row missing');
      return rowToRule(row);
    },
    async update(input) {
      const ts = input.now.toISOString();
      const set: Partial<typeof projectRules.$inferSelect> = { updatedAt: ts };
      if (input.title !== undefined) set.title = input.title;
      if (input.definition !== undefined) set.definition = input.definition as unknown;
      if (input.enabled !== undefined) set.enabled = input.enabled;
      await db.update(projectRules).set(set).where(eq(projectRules.id, input.id));
      const [row] = await db.select().from(projectRules).where(eq(projectRules.id, input.id));
      return row ? rowToRule(row) : null;
    },
    async remove(id) {
      const result = await db.delete(projectRules).where(eq(projectRules.id, id));
      return { deleted: (result.changes ?? 0) > 0 };
    },
  };
}

/**
 * Run a single shell rule against a node. Spec §16:
 *   - Spawn the configured command with stdin = ShellRuleIo (JSON).
 *   - Read stdout as a ShellRuleResponse JSON.
 *   - Timeout per rule (default 5s) — overrun returns 'skip' with a
 *     timeout message rather than crashing.
 *   - Non-zero exit code with no stdout → 'skip', message captures
 *     stderr.
 *   - Errors must NOT propagate to the analyzer. The whole point of
 *     shell rules is reviewer-authored extension; a broken script
 *     should never break analysis.
 */
export async function evaluateShellRule(input: {
  command: string;
  timeoutMs?: number;
  io: unknown;
}): Promise<{ kind: RuleResultKind; message: string | null }> {
  const timeoutMs = input.timeoutMs ?? 5000;
  return await new Promise((resolveP) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn('sh', ['-c', input.command], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const settle = (kind: RuleResultKind, message: string | null) => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        // already dead — fine.
      }
      resolveP({ kind, message });
    };
    const timer = setTimeout(() => {
      settle('skip', `timed out after ${timeoutMs}ms`);
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      settle('skip', `shell rule failed to spawn: ${err.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        settle('skip', stderr.trim() || `exit code ${code} with no output`);
        return;
      }
      try {
        const parsed = JSON.parse(trimmed) as { kind?: string; message?: string };
        const kind: RuleResultKind =
          parsed.kind === 'pass' || parsed.kind === 'fail' || parsed.kind === 'skip'
            ? parsed.kind
            : 'skip';
        settle(kind, parsed.message ?? null);
      } catch (err) {
        settle('skip', `unparseable shell output: ${(err as Error).message}`);
      }
    });
    try {
      child.stdin.end(JSON.stringify(input.io));
    } catch {
      // child may have already errored — handled above.
    }
  });
}

/**
 * LLM rule executor stub. Without an LLM client wired into the host,
 * we always return 'skip' — preserves the LLM degradation contract.
 */
export function evaluateLlmRule(): RuleResult['kind'] {
  return 'skip';
}
