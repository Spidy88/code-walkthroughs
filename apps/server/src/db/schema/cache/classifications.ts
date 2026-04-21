import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const classifications = sqliteTable(
  'classifications',
  {
    nodeIdentity: text('node_identity').primaryKey(),
    filePath: text('file_path').notNull(),
    classification: text('classification').notNull(),
    confidence: text('confidence').notNull(),
    source: text('source').notNull(),
    contentHash: text('content_hash').notNull(),
    justification: text('justification'),
    contributingSignals: text('contributing_signals', { mode: 'json' }).notNull(),
    conflicting: text('conflicting').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    byFile: index('idx_classifications_file').on(table.filePath),
  }),
);

export type ClassificationRow = typeof classifications.$inferSelect;
