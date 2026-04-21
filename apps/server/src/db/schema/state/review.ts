import { sql } from 'drizzle-orm';
import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const reviewStatus = sqliteTable(
  'review_status',
  {
    id: text('id').primaryKey(),
    nodeIdentity: text('node_identity').notNull(),
    scope: text('scope').notNull().default(sql`'global'`),
    status: text('status').notNull(),
    comment: text('comment'),
    codeHash: text('code_hash').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    uniqByNodeScope: uniqueIndex('idx_review_status_node_scope').on(
      table.nodeIdentity,
      table.scope,
    ),
    byNode: index('idx_review_status_node').on(table.nodeIdentity),
  }),
);

export type ReviewStatusRow = typeof reviewStatus.$inferSelect;
export type ReviewStatusInsert = typeof reviewStatus.$inferInsert;

export const reviewHistory = sqliteTable(
  'review_history',
  {
    id: text('id').primaryKey(),
    nodeIdentity: text('node_identity').notNull(),
    scope: text('scope').notNull(),
    status: text('status').notNull(),
    comment: text('comment'),
    codeHash: text('code_hash').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    supersededAt: text('superseded_at').notNull(),
    reason: text('reason'),
  },
  (table) => ({
    byNode: index('idx_review_history_node').on(table.nodeIdentity),
  }),
);

export type ReviewHistoryRow = typeof reviewHistory.$inferSelect;
export type ReviewHistoryInsert = typeof reviewHistory.$inferInsert;
