import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import * as stateSchema from '../src/db/schema/state/index.ts';
import { createReviewService } from '../src/review/service.ts';

function createStateDb(): ReturnType<typeof drizzle<typeof stateSchema>> {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE review_status (
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
    CREATE UNIQUE INDEX idx_review_status_node_scope
      ON review_status(node_identity, scope);
    CREATE TABLE review_history (
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
  `);
  return drizzle(sqlite, { schema: stateSchema });
}

const NODE = 'proj:src/foo.ts:bar';
const PATH_ID = 'pth-1';

describe('reviewService.promoteScopedApproval', () => {
  it('lifts a path-scoped row to global when no global exists', async () => {
    const db = createStateDb();
    const svc = createReviewService(db);
    await svc.setStatus({
      nodeIdentity: NODE,
      status: 'approved',
      comment: 'looks good for this path',
      codeHash: 'hash-1',
      reviewerId: 'rev',
      scope: { kind: 'path', pathId: PATH_ID },
      now: new Date('2026-04-26T12:00:00.000Z'),
    });

    const result = await svc.promoteScopedApproval({
      nodeIdentity: NODE,
      pathId: PATH_ID,
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:01:00.000Z'),
    });
    expect(result.promoted).toBe(true);

    const rows = await svc.list();
    // The path-scoped row is gone; a global row carries the same status
    // and comment values forward.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scope).toEqual({ kind: 'global' });
    expect(rows[0]?.status).toBe('approved');
    expect(rows[0]?.comment).toBe('looks good for this path');
  });

  it('overwrites an existing global row, archiving the prior decision', async () => {
    const db = createStateDb();
    const svc = createReviewService(db);
    await svc.setStatus({
      nodeIdentity: NODE,
      status: 'rejected',
      comment: 'old global concern',
      codeHash: 'hash-1',
      reviewerId: 'rev',
      scope: { kind: 'global' },
      now: new Date('2026-04-26T11:00:00.000Z'),
    });
    await svc.setStatus({
      nodeIdentity: NODE,
      status: 'approved',
      comment: 'fine on this path',
      codeHash: 'hash-1',
      reviewerId: 'rev',
      scope: { kind: 'path', pathId: PATH_ID },
      now: new Date('2026-04-26T11:30:00.000Z'),
    });

    const result = await svc.promoteScopedApproval({
      nodeIdentity: NODE,
      pathId: PATH_ID,
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.promoted).toBe(true);

    const rows = await svc.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.scope).toEqual({ kind: 'global' });
    // The promoted decision wins over the prior global.
    expect(rows[0]?.status).toBe('approved');
    expect(rows[0]?.comment).toBe('fine on this path');
  });

  it('is a no-op when there is no path-scoped row to promote', async () => {
    const db = createStateDb();
    const svc = createReviewService(db);
    const result = await svc.promoteScopedApproval({
      nodeIdentity: NODE,
      pathId: PATH_ID,
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.promoted).toBe(false);
  });
});
