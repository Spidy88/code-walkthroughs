import { index, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * One row per (rule, node) outcome of a built-in rule evaluation.
 * Evaluated during analysis (deterministic, no LLM); the walkthrough
 * checklist sidebar reads from here.
 */
export const ruleResults = sqliteTable(
  'rule_results',
  {
    ruleId: text('rule_id').notNull(),
    nodeIdentity: text('node_identity').notNull(),
    kind: text('kind').notNull(),
    message: text('message'),
    evaluatedAt: text('evaluated_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.ruleId, table.nodeIdentity] }),
    byNode: index('idx_rule_results_node').on(table.nodeIdentity),
  }),
);

export type RuleResultRow = typeof ruleResults.$inferSelect;
