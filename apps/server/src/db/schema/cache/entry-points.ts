import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const entryPoints = sqliteTable(
  'entry_points',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id').notNull(),
    kind: text('kind').notNull(),
    framework: text('framework').notNull(),
    nodeIdentity: text('node_identity').notNull(),
    metadata: text('metadata', { mode: 'json' }).notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    byProject: index('idx_entry_points_project').on(table.projectId),
  }),
);

export type EntryPointRow = typeof entryPoints.$inferSelect;
