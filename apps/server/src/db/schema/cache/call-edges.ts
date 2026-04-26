import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Resolved call edges between analyzed nodes. Persisted at analysis time
 * so the walkthrough can render downstream callees (the "dig into"
 * affordance) without re-parsing the source file. Each row corresponds
 * to one call site: a caller may call the same callee multiple times.
 */
export const callEdges = sqliteTable(
  'call_edges',
  {
    callerIdentity: text('caller_identity').notNull(),
    calleeIdentity: text('callee_identity'),
    callSiteLine: integer('call_site_line').notNull(),
    callSiteColumn: integer('call_site_column').notNull(),
    unresolved: integer('unresolved', { mode: 'boolean' }).notNull(),
    unresolvedHint: text('unresolved_hint'),
    projectId: text('project_id').notNull(),
  },
  (table) => ({
    byCaller: index('idx_call_edges_caller').on(table.callerIdentity),
    byCallee: index('idx_call_edges_callee').on(table.calleeIdentity),
  }),
);

export type CallEdgeRow = typeof callEdges.$inferSelect;
