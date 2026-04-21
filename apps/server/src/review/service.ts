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
