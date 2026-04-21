import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const prepAnswers = sqliteTable(
  'prep_answers',
  {
    id: text('id').primaryKey(),
    questionKey: text('question_key').notNull(),
    questionKind: text('question_kind').notNull(),
    answer: text('answer', { mode: 'json' }).notNull(),
    answeredAt: text('answered_at').notNull(),
  },
  (table) => ({
    uniqByKey: uniqueIndex('idx_prep_answers_key').on(table.questionKey),
  }),
);

export type PrepAnswerRow = typeof prepAnswers.$inferSelect;
export type PrepAnswerInsert = typeof prepAnswers.$inferInsert;
