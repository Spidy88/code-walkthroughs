import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  analyzedNodes,
  classifications,
  pathNodes as pathNodesTable,
} from '../db/schema/cache/index.ts';
import { reviewHistory, reviewStatus } from '../db/schema/state/review.ts';
import { router, scopedProcedure } from './trpc.ts';

/**
 * Scopes per spec §10:
 *   codebase — all analyzed nodes in the active codebase.
 *   project  — same as codebase in v1 (one project per codebase).
 *   path     — the nodes that make up a single path's sequence.
 *   file     — the nodes inside one file.
 */
const scopeSchema = z.object({
  kind: z.enum(['codebase', 'project', 'path', 'file']),
  id: z.string().min(1).optional(),
});

type Counts = {
  approved: number;
  rejected: number;
  infoRequested: number;
  stale: number;
  neverReviewed: number;
  total: number;
};

export const progressRouter = router({
  summary: scopedProcedure.input(scopeSchema).query(async ({ ctx, input }) => {
    const cache = ctx.codebase.dbs.cache;
    const state = ctx.codebase.dbs.state;

    const identities = await resolveIdentitiesForScope({
      cache,
      kind: input.kind,
      id: input.id ?? null,
    });
    if (identities.length === 0) {
      return {
        scope: { kind: input.kind, id: input.id ?? null },
        counts: emptyCounts(),
        // Path coverage: % of in-scope nodes with any current review row.
        // Full coverage: % approved (the strict definition; spec §10.2).
        coverage: { path: 0, full: 0 },
      };
    }
    const [classRows, reviewRows] = await Promise.all([
      cache.select().from(classifications).where(inArray(classifications.nodeIdentity, identities)),
      state.select().from(reviewStatus).where(inArray(reviewStatus.nodeIdentity, identities)),
    ]);
    const classByIdentity = new Map(classRows.map((c) => [c.nodeIdentity, c]));
    const reviewsByIdentity = new Map<string, typeof reviewRows>();
    for (const r of reviewRows) {
      const arr = reviewsByIdentity.get(r.nodeIdentity) ?? [];
      arr.push(r);
      reviewsByIdentity.set(r.nodeIdentity, arr);
    }

    const counts: Counts = emptyCounts();
    counts.total = identities.length;
    for (const id of identities) {
      const cls = classByIdentity.get(id) ?? null;
      const candidates = reviewsByIdentity.get(id) ?? [];
      const kind = computeRuntimeKind({
        candidates,
        currentCodeHash: cls?.contentHash ?? null,
      });
      if (kind === 'reviewed_current_approved') counts.approved += 1;
      else if (kind === 'reviewed_current_rejected') counts.rejected += 1;
      else if (kind === 'info_requested') counts.infoRequested += 1;
      else if (kind === 'reviewed_stale') counts.stale += 1;
      else counts.neverReviewed += 1;
    }
    const reviewed = counts.approved + counts.rejected + counts.infoRequested + counts.stale;
    return {
      scope: { kind: input.kind, id: input.id ?? null },
      counts,
      coverage: {
        path: counts.total === 0 ? 0 : reviewed / counts.total,
        full: counts.total === 0 ? 0 : counts.approved / counts.total,
      },
    };
  }),

  /**
   * Resets every current review row in scope by archiving it to
   * review_history with reason='progress_reset'. The reviewer goes
   * back to a clean slate for the chosen surface.
   */
  reset: scopedProcedure.input(scopeSchema).mutation(async ({ ctx, input }) => {
    const cache = ctx.codebase.dbs.cache;
    const state = ctx.codebase.dbs.state;
    const identities = await resolveIdentitiesForScope({
      cache,
      kind: input.kind,
      id: input.id ?? null,
    });
    if (identities.length === 0) {
      return { reset: 0 };
    }
    const rows = await state
      .select()
      .from(reviewStatus)
      .where(inArray(reviewStatus.nodeIdentity, identities));
    if (rows.length === 0) return { reset: 0 };
    const ts = ctx.now().toISOString();
    for (const row of rows) {
      await state.insert(reviewHistory).values({
        id: `${row.id}-reset`,
        nodeIdentity: row.nodeIdentity,
        scope: row.scope,
        status: row.status,
        comment: row.comment,
        codeHash: row.codeHash,
        reviewerId: row.reviewerId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        supersededAt: ts,
        reason: 'progress_reset',
      });
    }
    await state.delete(reviewStatus).where(inArray(reviewStatus.nodeIdentity, identities));
    return { reset: rows.length };
  }),
});

async function resolveIdentitiesForScope(input: {
  cache: import('../db/codebase.ts').CacheDb;
  kind: 'codebase' | 'project' | 'path' | 'file';
  id: string | null;
}): Promise<string[]> {
  if (input.kind === 'codebase' || input.kind === 'project') {
    const rows = await input.cache.select().from(analyzedNodes);
    return rows.map((r) => r.nodeIdentity);
  }
  if (input.kind === 'file') {
    if (!input.id) return [];
    const rows = await input.cache
      .select()
      .from(analyzedNodes)
      .where(eq(analyzedNodes.filePath, input.id));
    return rows.map((r) => r.nodeIdentity);
  }
  // path
  if (!input.id) return [];
  const rows = await input.cache
    .select()
    .from(pathNodesTable)
    .where(eq(pathNodesTable.pathId, input.id));
  return rows.map((r) => r.nodeIdentity);
}

function emptyCounts(): Counts {
  return {
    approved: 0,
    rejected: 0,
    infoRequested: 0,
    stale: 0,
    neverReviewed: 0,
    total: 0,
  };
}

type RuntimeKind =
  | 'never_reviewed'
  | 'reviewed_current_approved'
  | 'reviewed_current_rejected'
  | 'reviewed_stale'
  | 'info_requested';

function computeRuntimeKind(input: {
  candidates: ReadonlyArray<{
    readonly scope: string;
    readonly status: string;
    readonly codeHash: string;
  }>;
  currentCodeHash: string | null;
}): RuntimeKind {
  if (input.candidates.length === 0) return 'never_reviewed';
  const chosen = input.candidates.find((c) => c.scope === 'global') ?? input.candidates[0];
  if (!chosen) return 'never_reviewed';
  const stale =
    input.currentCodeHash !== null &&
    chosen.codeHash !== '' &&
    chosen.codeHash !== input.currentCodeHash;
  if (stale) return 'reviewed_stale';
  if (chosen.status === 'info_requested') return 'info_requested';
  if (chosen.status === 'approved') return 'reviewed_current_approved';
  if (chosen.status === 'rejected') return 'reviewed_current_rejected';
  return 'never_reviewed';
}
