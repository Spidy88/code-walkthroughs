import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Project-scoped user-authored rules (shell or LLM tier). Lives in
 * state.db so they survive cache rebuilds and stay tied to their
 * codebase. User-scope rules live in user.db (apps/server/src/db/
 * schema/user/user-rules.ts) and apply across every codebase the
 * reviewer opens.
 */
export const projectRules = sqliteTable('project_rules', {
  id: text('id').primaryKey(),
  classification: text('classification').notNull(),
  title: text('title').notNull(),
  tier: text('tier').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type ProjectRuleRow = typeof projectRules.$inferSelect;
export type ProjectRuleInsert = typeof projectRules.$inferInsert;
