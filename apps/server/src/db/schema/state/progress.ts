import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const progress = sqliteTable(
  'progress',
  {
    scopeKind: text('scope_kind').notNull(),
    scopeId: text('scope_id').notNull(),
    approved: integer('approved').notNull().default(0),
    rejected: integer('rejected').notNull().default(0),
    infoRequested: integer('info_requested').notNull().default(0),
    pending: integer('pending').notNull().default(0),
    total: integer('total').notNull().default(0),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.scopeKind, table.scopeId] }),
  }),
);

export type ProgressRow = typeof progress.$inferSelect;
