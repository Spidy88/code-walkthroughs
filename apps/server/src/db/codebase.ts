import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as cacheSchema from './schema/cache/index.ts';
import * as stateSchema from './schema/state/index.ts';

export type StateDb = BetterSQLite3Database<typeof stateSchema>;
export type CacheDb = BetterSQLite3Database<typeof cacheSchema>;

export type CodebaseDbs = {
  readonly state: StateDb;
  readonly cache: CacheDb;
  close(): void;
};

export function openCodebaseDbs(options: {
  readonly stateDbPath: string;
  readonly cacheDbPath: string;
}): CodebaseDbs {
  mkdirSync(dirname(options.stateDbPath), { recursive: true });
  mkdirSync(dirname(options.cacheDbPath), { recursive: true });

  const stateSqlite = new Database(options.stateDbPath);
  stateSqlite.pragma('journal_mode = WAL');
  stateSqlite.pragma('foreign_keys = ON');
  runStateMigrations(stateSqlite);

  const cacheSqlite = new Database(options.cacheDbPath);
  cacheSqlite.pragma('journal_mode = WAL');
  cacheSqlite.pragma('foreign_keys = ON');
  runCacheMigrations(cacheSqlite);

  const state = drizzle(stateSqlite, { schema: stateSchema });
  const cache = drizzle(cacheSqlite, { schema: cacheSchema });

  return {
    state,
    cache,
    close() {
      stateSqlite.close();
      cacheSqlite.close();
    },
  };
}

function runStateMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS review_status (
      id TEXT PRIMARY KEY,
      node_identity TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'global',
      status TEXT NOT NULL,
      comment TEXT,
      code_hash TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_status_node_scope
      ON review_status(node_identity, scope);
    CREATE INDEX IF NOT EXISTS idx_review_status_node ON review_status(node_identity);

    CREATE TABLE IF NOT EXISTS review_history (
      id TEXT PRIMARY KEY,
      node_identity TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      comment TEXT,
      code_hash TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      superseded_at TEXT NOT NULL,
      reason TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_review_history_node ON review_history(node_identity);

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      anchor_kind TEXT NOT NULL,
      file_path TEXT NOT NULL,
      function_identity TEXT,
      line_start INTEGER,
      line_end INTEGER,
      body TEXT NOT NULL,
      reviewer_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_comments_file ON comments(file_path);
    CREATE INDEX IF NOT EXISTS idx_comments_function ON comments(function_identity);

    CREATE TABLE IF NOT EXISTS prep_answers (
      id TEXT PRIMARY KEY,
      question_key TEXT NOT NULL,
      question_kind TEXT NOT NULL,
      answer TEXT NOT NULL,
      answered_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_prep_answers_key ON prep_answers(question_key);

    CREATE TABLE IF NOT EXISTS progress (
      scope_kind TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      approved INTEGER NOT NULL DEFAULT 0,
      rejected INTEGER NOT NULL DEFAULT 0,
      info_requested INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scope_kind, scope_id)
    );

    CREATE TABLE IF NOT EXISTS session_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function runCacheMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      language TEXT NOT NULL,
      size INTEGER NOT NULL,
      analyzed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS analyzed_nodes (
      node_identity TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      exported INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_analyzed_nodes_project ON analyzed_nodes(project_id);
    CREATE INDEX IF NOT EXISTS idx_analyzed_nodes_file ON analyzed_nodes(file_path);

    CREATE TABLE IF NOT EXISTS classifications (
      node_identity TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      classification TEXT NOT NULL,
      confidence TEXT NOT NULL,
      source TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      justification TEXT,
      contributing_signals TEXT NOT NULL,
      conflicting TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_classifications_file ON classifications(file_path);

    CREATE TABLE IF NOT EXISTS entry_points (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      framework TEXT NOT NULL,
      node_identity TEXT NOT NULL,
      metadata TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entry_points_project ON entry_points(project_id);

    CREATE TABLE IF NOT EXISTS paths (
      id TEXT PRIMARY KEY,
      entry_point_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      node_count INTEGER NOT NULL,
      max_depth INTEGER NOT NULL,
      category TEXT,
      category_order INTEGER,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_paths_project ON paths(project_id);
    CREATE INDEX IF NOT EXISTS idx_paths_entry ON paths(entry_point_id);

    CREATE TABLE IF NOT EXISTS path_nodes (
      path_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      node_identity TEXT NOT NULL,
      fork_group INTEGER,
      change_kind TEXT,
      cycle_back_to_position INTEGER,
      PRIMARY KEY (path_id, position)
    );

    CREATE TABLE IF NOT EXISTS prep_questions (
      key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      context TEXT NOT NULL,
      suggestion TEXT,
      alternatives TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS llm_results (
      input_hash TEXT PRIMARY KEY,
      pipeline TEXT NOT NULL,
      prompt_name TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      model TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_read_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_llm_results_pipeline ON llm_results(pipeline);

    CREATE TABLE IF NOT EXISTS call_edges (
      caller_identity TEXT NOT NULL,
      callee_identity TEXT,
      call_site_line INTEGER NOT NULL,
      call_site_column INTEGER NOT NULL,
      unresolved INTEGER NOT NULL,
      unresolved_hint TEXT,
      project_id TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_call_edges_caller ON call_edges(caller_identity);
    CREATE INDEX IF NOT EXISTS idx_call_edges_callee ON call_edges(callee_identity);
  `);
}
