import { type ReviewStatus, type StatusScope, ulid } from '@cw/shared';
import { and, eq } from 'drizzle-orm';
import type { StateDb } from '../db/codebase.ts';
import { reviewHistory, reviewStatus } from '../db/schema/state/review.ts';

export type ReviewService = {
  setStatus(input: {
    nodeIdentity: string;
    status: ReviewStatus;
    comment: string | null;
    codeHash: string;
    reviewerId: string;
    scope: StatusScope;
    now: Date;
  }): Promise<{ updated: boolean }>;
  clear(input: {
    nodeIdentity: string;
    scope: StatusScope;
    reviewerId: string;
    now: Date;
    reason: string;
  }): Promise<{ cleared: boolean }>;
  /**
   * Lift a path-scoped review row to global. Reviewer's explicit choice
   * — they reviewed once for one path and want that decision to apply
   * everywhere this node is encountered. The path-scoped row is
   * archived; an existing global row (if any) is also archived and
   * replaced with the path-scoped values.
   */
  promoteScopedApproval(input: {
    nodeIdentity: string;
    pathId: string;
    reviewerId: string;
    now: Date;
  }): Promise<{ promoted: boolean }>;
  list(): Promise<ReviewStatusListRow[]>;
};

export type ReviewStatusListRow = {
  readonly id: string;
  readonly nodeIdentity: string;
  readonly scope: StatusScope;
  readonly status: ReviewStatus;
  readonly comment: string | null;
  readonly codeHash: string;
  readonly reviewerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

function serializeScope(scope: StatusScope): string {
  return scope.kind === 'global' ? 'global' : `path:${scope.pathId}`;
}

function parseScope(raw: string): StatusScope {
  if (raw === 'global') return { kind: 'global' };
  if (raw.startsWith('path:')) return { kind: 'path', pathId: raw.slice('path:'.length) };
  return { kind: 'global' };
}

export function createReviewService(db: StateDb): ReviewService {
  return {
    async setStatus(input) {
      const scopeKey = serializeScope(input.scope);
      const existing = await db
        .select()
        .from(reviewStatus)
        .where(
          and(eq(reviewStatus.nodeIdentity, input.nodeIdentity), eq(reviewStatus.scope, scopeKey)),
        );
      const prior = existing[0];
      const timestamp = input.now.toISOString();

      if (prior) {
        await db.insert(reviewHistory).values({
          id: ulid(),
          nodeIdentity: prior.nodeIdentity,
          scope: prior.scope,
          status: prior.status,
          comment: prior.comment,
          codeHash: prior.codeHash,
          reviewerId: prior.reviewerId,
          createdAt: prior.createdAt,
          updatedAt: prior.updatedAt,
          supersededAt: timestamp,
          reason: 'replaced',
        });
        await db
          .update(reviewStatus)
          .set({
            status: input.status,
            comment: input.comment,
            codeHash: input.codeHash,
            reviewerId: input.reviewerId,
            updatedAt: timestamp,
          })
          .where(eq(reviewStatus.id, prior.id));
        return { updated: true };
      }

      await db.insert(reviewStatus).values({
        id: ulid(),
        nodeIdentity: input.nodeIdentity,
        scope: scopeKey,
        status: input.status,
        comment: input.comment,
        codeHash: input.codeHash,
        reviewerId: input.reviewerId,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      return { updated: false };
    },

    async clear(input) {
      const scopeKey = serializeScope(input.scope);
      const existing = await db
        .select()
        .from(reviewStatus)
        .where(
          and(eq(reviewStatus.nodeIdentity, input.nodeIdentity), eq(reviewStatus.scope, scopeKey)),
        );
      const prior = existing[0];
      if (!prior) return { cleared: false };
      const timestamp = input.now.toISOString();
      await db.insert(reviewHistory).values({
        id: ulid(),
        nodeIdentity: prior.nodeIdentity,
        scope: prior.scope,
        status: prior.status,
        comment: prior.comment,
        codeHash: prior.codeHash,
        reviewerId: prior.reviewerId,
        createdAt: prior.createdAt,
        updatedAt: prior.updatedAt,
        supersededAt: timestamp,
        reason: input.reason,
      });
      await db.delete(reviewStatus).where(eq(reviewStatus.id, prior.id));
      return { cleared: true };
    },

    async promoteScopedApproval(input) {
      const pathScopeKey = `path:${input.pathId}`;
      const [scoped] = await db
        .select()
        .from(reviewStatus)
        .where(
          and(
            eq(reviewStatus.nodeIdentity, input.nodeIdentity),
            eq(reviewStatus.scope, pathScopeKey),
          ),
        );
      if (!scoped) return { promoted: false };

      const [globalRow] = await db
        .select()
        .from(reviewStatus)
        .where(
          and(eq(reviewStatus.nodeIdentity, input.nodeIdentity), eq(reviewStatus.scope, 'global')),
        );
      const timestamp = input.now.toISOString();

      // Archive any pre-existing global row so the audit trail keeps
      // the prior decision; the new global takes the path-scoped values.
      if (globalRow) {
        await db.insert(reviewHistory).values({
          id: ulid(),
          nodeIdentity: globalRow.nodeIdentity,
          scope: globalRow.scope,
          status: globalRow.status,
          comment: globalRow.comment,
          codeHash: globalRow.codeHash,
          reviewerId: globalRow.reviewerId,
          createdAt: globalRow.createdAt,
          updatedAt: globalRow.updatedAt,
          supersededAt: timestamp,
          reason: 'superseded_by_promote',
        });
        await db
          .update(reviewStatus)
          .set({
            status: scoped.status,
            comment: scoped.comment,
            codeHash: scoped.codeHash,
            reviewerId: input.reviewerId,
            updatedAt: timestamp,
          })
          .where(eq(reviewStatus.id, globalRow.id));
      } else {
        await db.insert(reviewStatus).values({
          id: ulid(),
          nodeIdentity: input.nodeIdentity,
          scope: 'global',
          status: scoped.status,
          comment: scoped.comment,
          codeHash: scoped.codeHash,
          reviewerId: input.reviewerId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      // Archive the path-scoped row and remove it. The decision now
      // lives globally; keeping a path row would just duplicate state.
      await db.insert(reviewHistory).values({
        id: ulid(),
        nodeIdentity: scoped.nodeIdentity,
        scope: scoped.scope,
        status: scoped.status,
        comment: scoped.comment,
        codeHash: scoped.codeHash,
        reviewerId: scoped.reviewerId,
        createdAt: scoped.createdAt,
        updatedAt: scoped.updatedAt,
        supersededAt: timestamp,
        reason: 'promoted_to_global',
      });
      await db.delete(reviewStatus).where(eq(reviewStatus.id, scoped.id));
      return { promoted: true };
    },

    async list() {
      const rows = await db.select().from(reviewStatus);
      return rows.map((r) => ({
        id: r.id,
        nodeIdentity: r.nodeIdentity,
        scope: parseScope(r.scope),
        status: r.status as ReviewStatus,
        comment: r.comment,
        codeHash: r.codeHash,
        reviewerId: r.reviewerId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },
  };
}
