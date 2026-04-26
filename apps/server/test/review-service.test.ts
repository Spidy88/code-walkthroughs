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

describe('reviewService.setFileStatus (file-level cascade)', () => {
  const FILE = 'src/orders.ts';
  const FN_A = 'proj:src/orders.ts:fnA';
  const FN_B = 'proj:src/orders.ts:fnB';
  const hashes = new Map([
    [FN_A, 'h-a'],
    [FN_B, 'h-b'],
  ]);

  it('applies cleanly to all functions when no conflicts exist', async () => {
    const db = createStateDb();
    const svc = createReviewService(db);
    const result = await svc.setFileStatus({
      filePath: FILE,
      functionIdentities: [FN_A, FN_B],
      functionCodeHashByIdentity: hashes,
      fileCodeHash: 'h-file',
      status: 'approved',
      comment: 'looks good across the file',
      conflictResolution: null,
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.functionsApplied).toBe(2);

    const all = await svc.list();
    // Both functions plus the file pseudo-identity carry an approved
    // global status.
    expect(all.map((r) => r.nodeIdentity).sort()).toEqual([`file:${FILE}`, FN_A, FN_B].sort());
    for (const row of all) {
      expect(row.status).toBe('approved');
      expect(row.scope).toEqual({ kind: 'global' });
    }
  });

  it('returns conflicts (no writes) when functions disagree and no resolution is supplied', async () => {
    const db = createStateDb();
    const svc = createReviewService(db);
    // Pre-existing function status that will conflict with the file
    // action. setFileStatus should report the conflict and write
    // nothing.
    await svc.setStatus({
      nodeIdentity: FN_A,
      status: 'rejected',
      comment: null,
      codeHash: 'h-a',
      reviewerId: 'rev',
      scope: { kind: 'global' },
      now: new Date('2026-04-26T11:00:00.000Z'),
    });

    const result = await svc.setFileStatus({
      filePath: FILE,
      functionIdentities: [FN_A, FN_B],
      functionCodeHashByIdentity: hashes,
      fileCodeHash: 'h-file',
      status: 'approved',
      comment: null,
      conflictResolution: null,
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.applied).toBe(false);
    if (result.applied) return;
    expect(result.conflicts).toEqual([{ nodeIdentity: FN_A, currentStatus: 'rejected' }]);

    // Nothing changed: the prior reject row is still there, no file
    // row was created.
    const all = await svc.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.nodeIdentity).toBe(FN_A);
    expect(all[0]?.status).toBe('rejected');
  });

  it("preserves conflicting function statuses when resolution is 'preserve'", async () => {
    const db = createStateDb();
    const svc = createReviewService(db);
    await svc.setStatus({
      nodeIdentity: FN_A,
      status: 'rejected',
      comment: 'bad',
      codeHash: 'h-a',
      reviewerId: 'rev',
      scope: { kind: 'global' },
      now: new Date('2026-04-26T11:00:00.000Z'),
    });

    const result = await svc.setFileStatus({
      filePath: FILE,
      functionIdentities: [FN_A, FN_B],
      functionCodeHashByIdentity: hashes,
      fileCodeHash: 'h-file',
      status: 'approved',
      comment: null,
      conflictResolution: 'preserve',
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.functionsApplied).toBe(1);
    expect(result.functionsPreserved).toBe(1);

    const byIdentity = new Map((await svc.list()).map((r) => [r.nodeIdentity, r]));
    expect(byIdentity.get(FN_A)?.status).toBe('rejected');
    expect(byIdentity.get(FN_B)?.status).toBe('approved');
    expect(byIdentity.get(`file:${FILE}`)?.status).toBe('approved');
  });

  it("overrides every function status when resolution is 'override'", async () => {
    const db = createStateDb();
    const svc = createReviewService(db);
    await svc.setStatus({
      nodeIdentity: FN_A,
      status: 'rejected',
      comment: 'bad',
      codeHash: 'h-a',
      reviewerId: 'rev',
      scope: { kind: 'global' },
      now: new Date('2026-04-26T11:00:00.000Z'),
    });

    const result = await svc.setFileStatus({
      filePath: FILE,
      functionIdentities: [FN_A, FN_B],
      functionCodeHashByIdentity: hashes,
      fileCodeHash: 'h-file',
      status: 'approved',
      comment: null,
      conflictResolution: 'override',
      reviewerId: 'rev',
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.functionsOverridden).toBe(1);
    expect(result.functionsApplied).toBe(1);

    const byIdentity = new Map((await svc.list()).map((r) => [r.nodeIdentity, r]));
    expect(byIdentity.get(FN_A)?.status).toBe('approved');
    expect(byIdentity.get(FN_B)?.status).toBe('approved');
    expect(byIdentity.get(`file:${FILE}`)?.status).toBe('approved');
  });
});
