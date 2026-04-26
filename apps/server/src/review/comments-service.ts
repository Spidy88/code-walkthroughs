import type { CommentAnchor } from '@cw/shared';
import { ulid } from '@cw/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { StateDb } from '../db/codebase.ts';
import { comments } from '../db/schema/state/comments.ts';

export type CommentRow = {
  readonly id: string;
  readonly anchor: CommentAnchor;
  readonly body: string;
  readonly reviewerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CommentsService = {
  add(input: {
    anchor: CommentAnchor;
    body: string;
    reviewerId: string;
    now: Date;
  }): Promise<CommentRow>;
  update(input: { id: string; body: string; now: Date }): Promise<CommentRow | null>;
  remove(input: { id: string; now: Date }): Promise<{ deleted: boolean }>;
  listForAnchor(anchor: CommentAnchor): Promise<CommentRow[]>;
};

function rowToComment(r: typeof comments.$inferSelect): CommentRow {
  // Anchor reconstructed from kind + the discriminated columns. Schema
  // already enforces that line/function rows carry their required ids.
  let anchor: CommentAnchor;
  if (r.anchorKind === 'line') {
    anchor = {
      kind: 'line',
      filePath: r.filePath,
      functionIdentity: r.functionIdentity ?? '',
      lineStart: r.lineStart ?? 0,
      lineEnd: r.lineEnd ?? 0,
    };
  } else if (r.anchorKind === 'function') {
    anchor = {
      kind: 'function',
      filePath: r.filePath,
      functionIdentity: r.functionIdentity ?? '',
    };
  } else {
    anchor = { kind: 'file', filePath: r.filePath };
  }
  return {
    id: r.id,
    anchor,
    body: r.body,
    reviewerId: r.reviewerId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function createCommentsService(db: StateDb): CommentsService {
  return {
    async add(input) {
      const ts = input.now.toISOString();
      const id = ulid();
      // Anchor → flat columns. Each kind populates a different subset.
      const lineStart = input.anchor.kind === 'line' ? input.anchor.lineStart : null;
      const lineEnd = input.anchor.kind === 'line' ? input.anchor.lineEnd : null;
      const functionIdentity =
        input.anchor.kind === 'function' || input.anchor.kind === 'line'
          ? input.anchor.functionIdentity
          : null;
      await db.insert(comments).values({
        id,
        anchorKind: input.anchor.kind,
        filePath: input.anchor.filePath,
        functionIdentity,
        lineStart,
        lineEnd,
        body: input.body,
        reviewerId: input.reviewerId,
        createdAt: ts,
        updatedAt: ts,
        archivedAt: null,
      });
      const [row] = await db.select().from(comments).where(eq(comments.id, id));
      if (!row) throw new Error('comment insert succeeded but row missing');
      return rowToComment(row);
    },

    async update(input) {
      const ts = input.now.toISOString();
      const [existing] = await db.select().from(comments).where(eq(comments.id, input.id));
      if (!existing || existing.archivedAt) return null;
      await db
        .update(comments)
        .set({ body: input.body, updatedAt: ts })
        .where(eq(comments.id, input.id));
      const [row] = await db.select().from(comments).where(eq(comments.id, input.id));
      return row ? rowToComment(row) : null;
    },

    async remove(input) {
      // Soft delete: archivedAt timestamp keeps history without
      // surfacing the row to listForAnchor. Spec calls this out so a
      // future "restore archived comments" UX has data to work with.
      const ts = input.now.toISOString();
      const result = await db
        .update(comments)
        .set({ archivedAt: ts, updatedAt: ts })
        .where(and(eq(comments.id, input.id), isNull(comments.archivedAt)));
      return { deleted: (result.changes ?? 0) > 0 };
    },

    async listForAnchor(anchor) {
      const conditions = [
        eq(comments.filePath, anchor.filePath),
        eq(comments.anchorKind, anchor.kind),
        isNull(comments.archivedAt),
      ];
      if (anchor.kind === 'function' || anchor.kind === 'line') {
        conditions.push(eq(comments.functionIdentity, anchor.functionIdentity));
      }
      if (anchor.kind === 'line') {
        conditions.push(eq(comments.lineStart, anchor.lineStart));
        conditions.push(eq(comments.lineEnd, anchor.lineEnd));
      }
      const rows = await db
        .select()
        .from(comments)
        .where(and(...conditions))
        .orderBy(asc(comments.createdAt));
      return rows.map(rowToComment);
    },
  };
}
