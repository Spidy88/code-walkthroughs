import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const userRules = sqliteTable('user_rules', {
  id: text('id').primaryKey(),
  classification: text('classification').notNull(),
  title: text('title').notNull(),
  tier: text('tier').notNull(),
  definition: text('definition', { mode: 'json' }).notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type UserRuleRow = typeof userRules.$inferSelect;
export type UserRuleInsert = typeof userRules.$inferInsert;
