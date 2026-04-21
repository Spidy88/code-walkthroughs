import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/user/index.ts';

export type UserDb = BetterSQLite3Database<typeof schema>;

export function openUserDb(dbPath: string): UserDb {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  runUserMigrations(sqlite);
  return db;
}

function runUserMigrations(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS recent_codebases (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      absolute_path TEXT NOT NULL,
      label TEXT,
      last_opened_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recent_codebases_hash ON recent_codebases(hash);

    CREATE TABLE IF NOT EXISTS user_rules (
      id TEXT PRIMARY KEY,
      classification TEXT NOT NULL,
      title TEXT NOT NULL,
      tier TEXT NOT NULL,
      definition TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
