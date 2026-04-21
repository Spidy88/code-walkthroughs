import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const userConfig = sqliteTable('user_config', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export type UserConfigRow = typeof userConfig.$inferSelect;
