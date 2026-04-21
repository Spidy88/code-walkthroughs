import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const sessionState = sqliteTable('session_state', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull(),
});

export type SessionStateRow = typeof sessionState.$inferSelect;
