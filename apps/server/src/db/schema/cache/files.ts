import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const files = sqliteTable('files', {
  path: text('path').primaryKey(),
  projectId: text('project_id').notNull(),
  contentHash: text('content_hash').notNull(),
  language: text('language').notNull(),
  size: integer('size').notNull(),
  analyzedAt: text('analyzed_at').notNull(),
});

export type FileRow = typeof files.$inferSelect;
export type FileInsert = typeof files.$inferInsert;
