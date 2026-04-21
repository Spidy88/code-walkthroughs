import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const comments = sqliteTable(
  'comments',
  {
    id: text('id').primaryKey(),
    anchorKind: text('anchor_kind').notNull(),
    filePath: text('file_path').notNull(),
    functionIdentity: text('function_identity'),
    lineStart: integer('line_start'),
    lineEnd: integer('line_end'),
    body: text('body').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    archivedAt: text('archived_at'),
  },
  (table) => ({
    byFile: index('idx_comments_file').on(table.filePath),
    byFunction: index('idx_comments_function').on(table.functionIdentity),
  }),
);

export type CommentRow = typeof comments.$inferSelect;
export type CommentInsert = typeof comments.$inferInsert;
