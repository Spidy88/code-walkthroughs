import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as cacheSchema from '../src/db/schema/cache/index.ts';
import { llmResults } from '../src/db/schema/cache/index.ts';
import { createLlmClient } from '../src/llm/client.ts';
import { silentLogger } from '../src/logger.ts';

const responseSchema = z.object({ ok: z.boolean() });

function createCache(): {
  db: ReturnType<typeof drizzle<typeof cacheSchema>>;
  raw: Database.Database;
} {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE llm_results (
      input_hash TEXT PRIMARY KEY,
      pipeline TEXT NOT NULL,
      prompt_name TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      model TEXT NOT NULL,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_read_at TEXT NOT NULL
    );
  `);
  return { db: drizzle(sqlite, { schema: cacheSchema }), raw: sqlite };
}

const baseOptions = {
  pipeline: 'classifyStage2' as const,
  promptName: 'p',
  promptVersion: '1',
  model: 'claude-haiku-4-5',
  systemPrompt: 's',
  messages: [{ role: 'user' as const, content: 'hello' }],
  input: { a: 1 },
  responseSchema,
};

describe('llm degradation', () => {
  it('disabled + no cache hit → kind disabled, cacheHit false', async () => {
    const { db } = createCache();
    const client = createLlmClient({
      apiKey: undefined,
      cacheDbProvider: () => db,
      logger: silentLogger(),
    });
    expect(client.enabled).toBe(false);
    const result = await client.call(baseOptions);
    expect(result.kind).toBe('disabled');
    if (result.kind === 'disabled') expect(result.cacheHit).toBe(false);
  });

  it('disabled + cache hit → kind disabled, cacheHit true, value returned', async () => {
    const { db } = createCache();
    const now = () => new Date('2026-04-21T00:00:00.000Z');

    const prepopulate = createLlmClient({
      apiKey: 'fake',
      cacheDbProvider: () => db,
      logger: silentLogger(),
      now,
    });
    // Manually insert a cache row matching the canonical hash.
    const { hashCanonical } = await import('@cw/shared');
    const inputHash = hashCanonical({
      pipeline: baseOptions.pipeline,
      promptName: baseOptions.promptName,
      promptVersion: baseOptions.promptVersion,
      model: baseOptions.model,
      input: baseOptions.input,
    });
    await db.insert(llmResults).values({
      inputHash,
      pipeline: baseOptions.pipeline,
      promptName: baseOptions.promptName,
      promptVersion: baseOptions.promptVersion,
      model: baseOptions.model,
      response: { ok: true } as unknown,
      createdAt: now().toISOString(),
      lastReadAt: now().toISOString(),
    });
    void prepopulate; // unused but validates deps shape

    const disabled = createLlmClient({
      apiKey: undefined,
      cacheDbProvider: () => db,
      logger: silentLogger(),
      now,
    });
    const result = await disabled.call(baseOptions);
    expect(result.kind).toBe('disabled');
    if (result.kind === 'disabled' && result.cacheHit) {
      expect(result.value).toEqual({ ok: true });
    } else {
      throw new Error('expected cacheHit=true');
    }
  });

  it('enabled + cache hit → source cache', async () => {
    const { db } = createCache();
    const now = () => new Date('2026-04-21T00:00:00.000Z');
    const { hashCanonical } = await import('@cw/shared');
    const inputHash = hashCanonical({
      pipeline: baseOptions.pipeline,
      promptName: baseOptions.promptName,
      promptVersion: baseOptions.promptVersion,
      model: baseOptions.model,
      input: baseOptions.input,
    });
    await db.insert(llmResults).values({
      inputHash,
      pipeline: baseOptions.pipeline,
      promptName: baseOptions.promptName,
      promptVersion: baseOptions.promptVersion,
      model: baseOptions.model,
      response: { ok: true } as unknown,
      createdAt: now().toISOString(),
      lastReadAt: now().toISOString(),
    });
    const client = createLlmClient({
      apiKey: 'sk-test',
      cacheDbProvider: () => db,
      logger: silentLogger(),
      now,
    });
    const result = await client.call(baseOptions);
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.source).toBe('cache');
      expect(result.value).toEqual({ ok: true });
    }
  });
});
