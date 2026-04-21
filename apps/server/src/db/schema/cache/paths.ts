import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const paths = sqliteTable(
  'paths',
  {
    id: text('id').primaryKey(),
    entryPointId: text('entry_point_id').notNull(),
    projectId: text('project_id').notNull(),
    nodeCount: integer('node_count').notNull(),
    maxDepth: integer('max_depth').notNull(),
    category: text('category'),
    categoryOrder: integer('category_order'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    byProject: index('idx_paths_project').on(table.projectId),
    byEntry: index('idx_paths_entry').on(table.entryPointId),
  }),
);

export type PathRow = typeof paths.$inferSelect;

export const pathNodes = sqliteTable(
  'path_nodes',
  {
    pathId: text('path_id').notNull(),
    position: integer('position').notNull(),
    nodeIdentity: text('node_identity').notNull(),
    forkGroup: integer('fork_group'),
    changeKind: text('change_kind'),
    cycleBackToPosition: integer('cycle_back_to_position'),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pathId, table.position] }),
  }),
);

export type PathNodeRow = typeof pathNodes.$inferSelect;
