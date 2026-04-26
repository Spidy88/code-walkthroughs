import { jsTsAdapter } from '@cw/adapters';
import { runAnalysis } from '@cw/analyzer';
import type { CodebaseId } from '@cw/shared';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import { persistAnalysis } from '../src/analysis/persist.ts';
import * as cacheSchema from '../src/db/schema/cache/index.ts';
import { entryPoints } from '../src/db/schema/cache/index.ts';

function createCacheDb(): ReturnType<typeof drizzle<typeof cacheSchema>> {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE files (
      path TEXT PRIMARY KEY, project_id TEXT NOT NULL, content_hash TEXT NOT NULL,
      language TEXT NOT NULL, size INTEGER NOT NULL, analyzed_at TEXT NOT NULL
    );
    CREATE TABLE analyzed_nodes (
      node_identity TEXT PRIMARY KEY, project_id TEXT NOT NULL, file_path TEXT NOT NULL,
      kind TEXT NOT NULL, name TEXT NOT NULL, start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL, exported INTEGER NOT NULL, content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE classifications (
      node_identity TEXT PRIMARY KEY, file_path TEXT NOT NULL, classification TEXT NOT NULL,
      confidence TEXT NOT NULL, source TEXT NOT NULL, content_hash TEXT NOT NULL,
      justification TEXT, contributing_signals TEXT NOT NULL, conflicting TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE entry_points (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL,
      framework TEXT NOT NULL, node_identity TEXT NOT NULL, metadata TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE paths (
      id TEXT PRIMARY KEY, entry_point_id TEXT NOT NULL, project_id TEXT NOT NULL,
      node_count INTEGER NOT NULL, max_depth INTEGER NOT NULL, category TEXT,
      category_order INTEGER, updated_at TEXT NOT NULL
    );
    CREATE TABLE path_nodes (
      path_id TEXT NOT NULL, position INTEGER NOT NULL, node_identity TEXT NOT NULL,
      fork_group INTEGER, change_kind TEXT, cycle_back_to_position INTEGER,
      PRIMARY KEY (path_id, position)
    );
    CREATE TABLE prep_questions (
      key TEXT PRIMARY KEY, kind TEXT NOT NULL, context TEXT NOT NULL,
      suggestion TEXT, alternatives TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  return drizzle(sqlite, { schema: cacheSchema });
}

describe('analysis persist', () => {
  it('persists express entry points end-to-end', async () => {
    const db = createCacheDb();
    const content = `
      import express from 'express';
      const app = express();
      app.get('/users', function listUsers(_req, res) { res.json([]); });
      app.post('/users', function createUser(_req, res) { res.status(201).end(); });
    `;
    const output = await runAnalysis(jsTsAdapter, {
      project: {
        id: 'proj1',
        codebaseId: 'proj1' as CodebaseId,
        name: 'demo',
        rootPath: '/tmp/demo',
        language: 'javascript',
        frameworks: [],
        walkable: true,
      },
      files: [{ filePath: 'src/server.ts', content }],
    });

    await persistAnalysis(
      db,
      'proj1',
      output,
      [
        {
          filePath: 'src/server.ts',
          absolutePath: '/tmp/demo/src/server.ts',
          content,
          size: content.length,
        },
      ],
      new Date('2026-04-21T00:00:00.000Z'),
    );

    const rows = await db.select().from(entryPoints);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.map((r) => r.framework)).toContain('express');
  });
});
