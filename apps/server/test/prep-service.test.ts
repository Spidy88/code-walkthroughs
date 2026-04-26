import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import * as cacheSchema from '../src/db/schema/cache/index.ts';
import * as stateSchema from '../src/db/schema/state/index.ts';
import { createPrepService } from '../src/prep/service.ts';

function createDbs() {
  const cacheSqlite = new Database(':memory:');
  cacheSqlite.exec(`
    CREATE TABLE classifications (
      node_identity TEXT PRIMARY KEY, file_path TEXT NOT NULL, classification TEXT NOT NULL,
      confidence TEXT NOT NULL, source TEXT NOT NULL, content_hash TEXT NOT NULL,
      justification TEXT, contributing_signals TEXT NOT NULL, conflicting TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE prep_questions (
      key TEXT PRIMARY KEY, kind TEXT NOT NULL, context TEXT NOT NULL,
      suggestion TEXT, alternatives TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const stateSqlite = new Database(':memory:');
  stateSqlite.exec(`
    CREATE TABLE prep_answers (
      id TEXT PRIMARY KEY, question_key TEXT NOT NULL, question_kind TEXT NOT NULL,
      answer TEXT NOT NULL, answered_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_prep_answers_key ON prep_answers(question_key);
  `);
  return {
    cache: drizzle(cacheSqlite, { schema: cacheSchema }),
    state: drizzle(stateSqlite, { schema: stateSchema }),
  };
}

const FILE = 'src/server.ts';
const NODE = 'file:src/server.ts';

async function seed(db: ReturnType<typeof createDbs>) {
  // A `classification`-kind question for an unclassified file, plus a
  // matching classifications row at low confidence — this is the
  // shape stage3 produces in the express-tiny fixture today.
  await db.cache.insert(cacheSchema.classifications).values({
    nodeIdentity: NODE,
    filePath: FILE,
    classification: 'unclassified',
    confidence: 'none',
    source: 'stage1',
    contentHash: 'hash-1',
    justification: null,
    contributingSignals: '[]' as unknown,
    conflicting: 'false',
    updatedAt: '2026-04-26T11:00:00.000Z',
  });
  await db.cache.insert(cacheSchema.prepQuestions).values({
    key: 'q-1',
    kind: 'classification',
    context: { kind: 'classification', filePath: FILE, nodeIdentity: NODE } as unknown,
    suggestion: null,
    alternatives: [] as unknown,
    createdAt: '2026-04-26T11:00:00.000Z',
  });
}

describe('prepService', () => {
  it('lists pending questions and excludes answered ones unless asked', async () => {
    const db = createDbs();
    await seed(db);
    const svc = createPrepService(db);

    const pendingBefore = await svc.list({ includeAnswered: false });
    expect(pendingBefore).toHaveLength(1);
    expect(pendingBefore[0]?.answer).toBeNull();

    await svc.answer({
      key: 'q-1',
      answer: { kind: 'classification', classification: 'route_handler' },
      now: new Date('2026-04-26T12:00:00.000Z'),
    });

    const pendingAfter = await svc.list({ includeAnswered: false });
    expect(pendingAfter).toHaveLength(0);
    const all = await svc.list({ includeAnswered: true });
    expect(all).toHaveLength(1);
    expect(all[0]?.answer).toEqual({ kind: 'classification', classification: 'route_handler' });
  });

  it('classification answer rewrites cache.db.classifications with high confidence + prep source', async () => {
    const db = createDbs();
    await seed(db);
    const svc = createPrepService(db);

    const result = await svc.answer({
      key: 'q-1',
      answer: { kind: 'classification', classification: 'service' },
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.appliedClassification).toBe('service');

    const [row] = await db.cache.select().from(cacheSchema.classifications);
    expect(row?.classification).toBe('service');
    expect(row?.confidence).toBe('high');
    expect(row?.source).toBe('prep');
  });

  it('rejects answers whose kind does not match the question kind', async () => {
    const db = createDbs();
    await seed(db);
    const svc = createPrepService(db);

    const result = await svc.answer({
      key: 'q-1',
      answer: { kind: 'path_branch', chosenIdentity: 'foo' },
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    expect(result.answered).toBe(false);

    // Classification row should be untouched.
    const [row] = await db.cache.select().from(cacheSchema.classifications);
    expect(row?.classification).toBe('unclassified');
    expect(row?.source).toBe('stage1');
  });

  it('overwrites a prior answer rather than inserting a duplicate', async () => {
    const db = createDbs();
    await seed(db);
    const svc = createPrepService(db);

    await svc.answer({
      key: 'q-1',
      answer: { kind: 'classification', classification: 'service' },
      now: new Date('2026-04-26T12:00:00.000Z'),
    });
    await svc.answer({
      key: 'q-1',
      answer: { kind: 'classification', classification: 'route_handler' },
      now: new Date('2026-04-26T13:00:00.000Z'),
    });

    const all = await svc.list({ includeAnswered: true });
    expect(all).toHaveLength(1);
    expect(all[0]?.answer).toEqual({ kind: 'classification', classification: 'route_handler' });
    const [row] = await db.cache.select().from(cacheSchema.classifications);
    expect(row?.classification).toBe('route_handler');
  });
});
