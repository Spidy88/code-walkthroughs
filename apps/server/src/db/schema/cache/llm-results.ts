import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const llmResults = sqliteTable(
  'llm_results',
  {
    inputHash: text('input_hash').primaryKey(),
    pipeline: text('pipeline').notNull(),
    promptName: text('prompt_name').notNull(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    response: text('response', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull(),
    lastReadAt: text('last_read_at').notNull(),
  },
  (table) => ({
    byPipeline: index('idx_llm_results_pipeline').on(table.pipeline),
  }),
);

export type LlmResultRow = typeof llmResults.$inferSelect;
export type LlmResultInsert = typeof llmResults.$inferInsert;
