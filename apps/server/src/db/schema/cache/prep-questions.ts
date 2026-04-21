import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const prepQuestions = sqliteTable(
  'prep_questions',
  {
    key: text('key').primaryKey(),
    kind: text('kind').notNull(),
    context: text('context', { mode: 'json' }).notNull(),
    suggestion: text('suggestion', { mode: 'json' }),
    alternatives: text('alternatives', { mode: 'json' }).notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    byKind: uniqueIndex('idx_prep_questions_key').on(table.key),
  }),
);

export type PrepQuestionRow = typeof prepQuestions.$inferSelect;
