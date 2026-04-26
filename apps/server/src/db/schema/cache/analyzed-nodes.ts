import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * One row per AnalyzedNode emitted by the language adapter. Persisting
 * these means walkthrough.getPath / walkthrough.getNode can render
 * code snippets, classifications, and signature info without re-parsing
 * the source on every query.
 */
export const analyzedNodes = sqliteTable(
  'analyzed_nodes',
  {
    nodeIdentity: text('node_identity').primaryKey(),
    projectId: text('project_id').notNull(),
    filePath: text('file_path').notNull(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
    exported: integer('exported', { mode: 'boolean' }).notNull(),
    contentHash: text('content_hash').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    byProject: index('idx_analyzed_nodes_project').on(table.projectId),
    byFile: index('idx_analyzed_nodes_file').on(table.filePath),
  }),
);

export type AnalyzedNodeRow = typeof analyzedNodes.$inferSelect;
