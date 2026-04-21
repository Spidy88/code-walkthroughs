import Anthropic from '@anthropic-ai/sdk';
import { hashCanonical } from '@cw/shared';
import { eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { CacheDb } from '../db/codebase.ts';
import { llmResults } from '../db/schema/cache/index.ts';
import type { Logger } from '../logger.ts';
import type { LlmPipelineName } from './models.ts';

export type LlmMessage = { readonly role: 'user' | 'assistant'; readonly content: string };

export type LlmCallOptions<T> = {
  readonly pipeline: LlmPipelineName;
  readonly promptName: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly messages: readonly LlmMessage[];
  readonly input: unknown;
  readonly responseSchema: z.ZodType<T>;
  readonly signal?: AbortSignal;
  readonly cache?: 'read' | 'write' | 'read-write' | 'none';
  readonly maxTokens?: number;
};

export type LlmResult<T> =
  | { readonly kind: 'ok'; readonly value: T; readonly source: 'cache' | 'api' }
  | { readonly kind: 'disabled'; readonly cacheHit: false }
  | { readonly kind: 'disabled'; readonly cacheHit: true; readonly value: T };

export type LlmClient = {
  readonly enabled: boolean;
  call<T>(options: LlmCallOptions<T>): Promise<LlmResult<T>>;
};

export type LlmClientDeps = {
  readonly apiKey: string | undefined;
  readonly cacheDbProvider: () => CacheDb | null;
  readonly logger: Logger;
  readonly now?: () => Date;
};

export function createLlmClient(deps: LlmClientDeps): LlmClient {
  const enabled = Boolean(deps.apiKey);
  const anthropic = enabled ? new Anthropic({ apiKey: deps.apiKey }) : null;
  const now = deps.now ?? (() => new Date());

  async function call<T>(options: LlmCallOptions<T>): Promise<LlmResult<T>> {
    const cacheMode = options.cache ?? 'read-write';
    const inputHash = computeInputHash(options);
    const cacheDb = deps.cacheDbProvider();
    const log = deps.logger.child({
      pipeline: options.pipeline,
      promptName: options.promptName,
      promptVersion: options.promptVersion,
      model: options.model,
      inputHash: `${inputHash.slice(0, 10)}…`,
    });

    if (cacheDb && cacheMode !== 'none' && cacheMode !== 'write') {
      const cached = await readCache<T>(cacheDb, inputHash, options, now);
      if (cached) {
        if (!enabled || !anthropic) {
          log.info({ source: 'cache' }, 'llm call served from cache (disabled)');
          return { kind: 'disabled', cacheHit: true, value: cached };
        }
        log.info({ source: 'cache' }, 'llm call served from cache');
        return { kind: 'ok', value: cached, source: 'cache' };
      }
    }

    if (!enabled || !anthropic) {
      log.info('llm call skipped (disabled)');
      return { kind: 'disabled', cacheHit: false };
    }

    const started = Date.now();
    log.info('llm call issued');
    const response = await anthropic.messages.create(
      {
        model: options.model,
        max_tokens: options.maxTokens ?? 1024,
        system: options.systemPrompt,
        messages: options.messages.map((m) => ({ role: m.role, content: m.content })),
      },
      { signal: options.signal ?? null },
    );

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => ('text' in block ? block.text : ''))
      .join('');

    const parsed = parseAndValidate(text, options.responseSchema);

    if (cacheDb && cacheMode !== 'none' && cacheMode !== 'read') {
      await writeCache(cacheDb, inputHash, options, parsed, now);
    }

    log.info(
      {
        source: 'api',
        durationMs: Date.now() - started,
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      },
      'llm call complete',
    );
    return { kind: 'ok', value: parsed, source: 'api' };
  }

  return { enabled, call };
}

function computeInputHash(options: LlmCallOptions<unknown>): string {
  return hashCanonical({
    pipeline: options.pipeline,
    promptName: options.promptName,
    promptVersion: options.promptVersion,
    model: options.model,
    input: options.input,
  });
}

async function readCache<T>(
  db: CacheDb,
  inputHash: string,
  options: LlmCallOptions<T>,
  now: () => Date,
): Promise<T | null> {
  const rows = await db.select().from(llmResults).where(eq(llmResults.inputHash, inputHash));
  const row = rows[0];
  if (!row) return null;
  if (row.promptVersion !== options.promptVersion) return null;
  const parsed = options.responseSchema.safeParse(row.response);
  if (!parsed.success) return null;
  await db
    .update(llmResults)
    .set({ lastReadAt: now().toISOString() })
    .where(eq(llmResults.inputHash, inputHash));
  return parsed.data;
}

async function writeCache<T>(
  db: CacheDb,
  inputHash: string,
  options: LlmCallOptions<T>,
  value: T,
  now: () => Date,
): Promise<void> {
  const timestamp = now().toISOString();
  await db
    .insert(llmResults)
    .values({
      inputHash,
      pipeline: options.pipeline,
      promptName: options.promptName,
      promptVersion: options.promptVersion,
      model: options.model,
      response: value as unknown,
      createdAt: timestamp,
      lastReadAt: timestamp,
    })
    .onConflictDoUpdate({
      target: llmResults.inputHash,
      set: {
        response: value as unknown,
        promptVersion: options.promptVersion,
        model: options.model,
        lastReadAt: timestamp,
      },
    });
}

function parseAndValidate<T>(text: string, schema: z.ZodType<T>): T {
  const trimmed = text.trim();
  let jsonText = trimmed;
  if (trimmed.startsWith('```')) {
    const fenceEnd = trimmed.indexOf('\n');
    const closing = trimmed.lastIndexOf('```');
    if (fenceEnd !== -1 && closing > fenceEnd) {
      jsonText = trimmed.slice(fenceEnd + 1, closing).trim();
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new LlmResponseError('failed to parse JSON from LLM response', { cause: err });
  }
  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new LlmResponseError('LLM response failed schema validation', {
      cause: result.error,
    });
  }
  return result.data;
}

export class LlmResponseError extends Error {
  readonly code = 'LLM_RESPONSE_INVALID' as const;
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LlmResponseError';
  }
}

// Used by test / sql drizzle type-checks; keeps `sql` import reachable.
void sql;
