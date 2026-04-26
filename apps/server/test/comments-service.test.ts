import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import * as stateSchema from '../src/db/schema/state/index.ts';
import { createCommentsService } from '../src/review/comments-service.ts';

function createStateDb(): ReturnType<typeof drizzle<typeof stateSchema>> {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE comments (
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
  `);
  return drizzle(sqlite, { schema: stateSchema });
}

const FN = 'proj:src/orders.ts:listOrders';
const FILE = 'src/orders.ts';

describe('commentsService', () => {
  it('adds and lists function-anchored comments in created-at order', async () => {
    const db = createStateDb();
    const svc = createCommentsService(db);
    const a = await svc.add({
      anchor: { kind: 'function', filePath: FILE, functionIdentity: FN },
      body: 'first observation',
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    const b = await svc.add({
      anchor: { kind: 'function', filePath: FILE, functionIdentity: FN },
      body: 'second observation',
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:01:00.000Z'),
    });

    const rows = await svc.listForAnchor({
      kind: 'function',
      filePath: FILE,
      functionIdentity: FN,
    });
    expect(rows.map((r) => r.id)).toEqual([a.id, b.id]);
    expect(rows.map((r) => r.body)).toEqual(['first observation', 'second observation']);
  });

  it('isolates comments per anchor (file vs function vs line)', async () => {
    const db = createStateDb();
    const svc = createCommentsService(db);
    await svc.add({
      anchor: { kind: 'file', filePath: FILE },
      body: 'file note',
      reviewerId: 'rev',
      now: new Date(),
    });
    await svc.add({
      anchor: { kind: 'function', filePath: FILE, functionIdentity: FN },
      body: 'function note',
      reviewerId: 'rev',
      now: new Date(),
    });
    await svc.add({
      anchor: {
        kind: 'line',
        filePath: FILE,
        functionIdentity: FN,
        lineStart: 3,
        lineEnd: 5,
      },
      body: 'lines 3-5 note',
      reviewerId: 'rev',
      now: new Date(),
    });

    const fileRows = await svc.listForAnchor({ kind: 'file', filePath: FILE });
    const fnRows = await svc.listForAnchor({
      kind: 'function',
      filePath: FILE,
      functionIdentity: FN,
    });
    const lineRows = await svc.listForAnchor({
      kind: 'line',
      filePath: FILE,
      functionIdentity: FN,
      lineStart: 3,
      lineEnd: 5,
    });
    expect(fileRows.map((r) => r.body)).toEqual(['file note']);
    expect(fnRows.map((r) => r.body)).toEqual(['function note']);
    expect(lineRows.map((r) => r.body)).toEqual(['lines 3-5 note']);
  });

  it('soft-deletes via archivedAt — list excludes them but the row stays', async () => {
    const db = createStateDb();
    const svc = createCommentsService(db);
    const a = await svc.add({
      anchor: { kind: 'function', filePath: FILE, functionIdentity: FN },
      body: 'will be deleted',
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });

    const result = await svc.remove({
      id: a.id,
      now: new Date('2026-04-26T12:05:00.000Z'),
    });
    expect(result.deleted).toBe(true);

    const rows = await svc.listForAnchor({
      kind: 'function',
      filePath: FILE,
      functionIdentity: FN,
    });
    expect(rows).toHaveLength(0);

    // A second remove is a no-op (row already archived).
    const second = await svc.remove({ id: a.id, now: new Date() });
    expect(second.deleted).toBe(false);
  });

  it('updates a comment body and bumps updatedAt', async () => {
    const db = createStateDb();
    const svc = createCommentsService(db);
    const a = await svc.add({
      anchor: { kind: 'function', filePath: FILE, functionIdentity: FN },
      body: 'original',
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });

    const updated = await svc.update({
      id: a.id,
      body: 'amended',
      now: new Date('2026-04-26T12:05:00.000Z'),
    });
    expect(updated?.body).toBe('amended');
    expect(updated?.updatedAt).toBe('2026-04-26T12:05:00.000Z');
    expect(updated?.createdAt).toBe('2026-04-26T12:00:00.000Z');
  });
});
