import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const recentCodebases = sqliteTable(
  'recent_codebases',
  {
    id: text('id').primaryKey(),
    hash: text('hash').notNull(),
    absolutePath: text('absolute_path').notNull(),
    label: text('label'),
    lastOpenedAt: text('last_opened_at').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    hashIdx: uniqueIndex('idx_recent_codebases_hash').on(table.hash),
  }),
);

export type RecentCodebaseRow = typeof recentCodebases.$inferSelect;
export type RecentCodebaseInsert = typeof recentCodebases.$inferInsert;
