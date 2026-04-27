# 06 — LLM Integration

## Scope

How the tool calls Claude, how results are cached, how every LLM-using pipeline handles unavailable LLM, and how we keep this layer narrow and testable. The **degradation contract** in this doc is normative for the entire codebase.

## Out of scope

Which pipelines use the LLM (that's per-pipeline, in `05-analysis-pipeline.md` and `08-review-state.md`). Prompt wording for specific pipelines (in `apps/server/src/llm/prompts/`).

## Principles

1. **Determinism first, LLM to fill gaps.** If a deterministic path exists, use it. LLMs resolve ambiguity, not structure.
2. **One client, one place.** `apps/server/src/llm/client.ts` is the only module that imports `@anthropic-ai/sdk`. Everything else goes through it.
3. **Everything is cached by content hash.** Every LLM call is keyed to a hash of its input; the response is cached in `cache.db.llm_results`. Re-running the same input is free.
4. **Every pipeline declares its degradation.** See "Degradation contract" below. Adding an LLM call without registering its degradation is a PR-blocking omission.
5. **Degradation never produces false positives.** A skipped check becomes `unchecked`, not `passed`. A missing classification is `unclassified`, not a guess.
6. **Cancellable.** Every call accepts an `AbortSignal` and aborts cleanly.

## Models

Defaults (override per-pipeline via config):

| Pipeline | Model | Rationale |
|---|---|---|
| Stage 0 architectural pass | `claude-opus-4-7` | Once per project; accuracy over cost |
| Stage 2 classification | `claude-haiku-4-5` | High volume per codebase |
| Path inference | `claude-opus-4-7` | Reasoning-heavy |
| Path categorization | `claude-opus-4-7` | Runs once per set; reasoning-heavy |
| Prep-answer pre-generation | `claude-haiku-4-5` | Short suggestions |
| LLM rule evaluation | User-configured; default `claude-haiku-4-5` | User choice |
| Fix/clarification suggestions | `claude-opus-4-7` | User-initiated, quality matters |
| Comparison: contract-change summary | `claude-haiku-4-5` | One sentence per change |
| Comparison: path-delta narrative | `claude-haiku-4-5` | Short paragraph per affected path |
| Comparison: delta-prep questions | `claude-opus-4-7` | Reasoning over the delta; quality matters |
| Comparison: alignment suggestions | `claude-opus-4-7` | Cross-path reasoning; runs once per comparison |

Model selection is central in `apps/server/src/llm/models.ts`. Every pipeline imports from there; no hard-coded model IDs elsewhere.

## The client module

```ts
// apps/server/src/llm/client.ts

export type LlmCallOptions = {
  readonly pipeline: PipelineName;         // e.g., 'classify.stage2'
  readonly promptName: string;             // e.g., 'classify_file_v2'
  readonly model: string;
  readonly input: unknown;                 // JSON-serializable
  readonly responseSchema: z.ZodTypeAny;   // Zod schema for the response
  readonly signal?: AbortSignal;
  readonly cache?: 'read' | 'write' | 'read-write' | 'none'; // default 'read-write'
  readonly enableAnthropicPromptCache?: boolean;             // default true
};

export type LlmResult<T> =
  | { kind: 'ok'; value: T; source: 'cache' | 'api' }
  | { kind: 'disabled'; cacheHit: false } // LLM off, cache miss
  | { kind: 'disabled'; cacheHit: true; value: T }; // LLM off, cache hit
```

The `disabled` result is how callers detect the "LLM off" case — they never see a thrown error for that.

**Errors** from the API (rate limit, 5xx, schema validation failure) throw. Callers decide whether to propagate or degrade.

**Anthropic prompt caching** is on by default for multi-turn pipelines. Prompt structure places stable context (system prompt, architectural hints) before the variable input so the cache breakpoint is effective.

## The cache layer

- **Storage**: `cache.db.llm_results`.
- **Key**: `sha256(pipeline + promptName + promptVersion + model + canonicalJson(input))`.
- **Value**: `{ response: JSON, validated: 0|1, createdAt, lastReadAt }`.
- **`lastReadAt`** supports "preserve frequently-used entries" under future cache pressure; v1 does not evict.
- **Cache reads are synchronous** (SQLite, single-process) and cheap.
- **Cache validation**: when a response is read, it is re-validated against the current Zod schema. If the schema has changed incompatibly, we treat it as a cache miss. (Compatible schema changes — added optional fields — pass validation unchanged.)

**Prompt versioning**: every prompt file exports a `version` string. Bumping it invalidates the cache for that prompt while leaving others intact.

## Degradation contract

**This table is normative.** Every LLM pipeline must appear here. When adding a new pipeline, add a row in the same PR.

| Pipeline | If LLM unavailable | Produces false positives? | UI surfacing |
|---|---|---|---|
| Stage 0 architectural summary | Skip; Stage 1 runs without priors | No (absence of priors) | None |
| Stage 2 classification | Keep Stage 1 + its confidence | No | Low-confidence items flow into Stage 3 prep queue without suggestion chip |
| Path inference fallback | Stop at deterministic resolution | No | Unresolved branches flow into prep queue |
| Path categorization & ordering | Flat deterministic order | No | Subtle banner: "Categorization disabled" |
| Prep-answer pre-generation | Show question without suggestion | No | No chip; composition field renders empty |
| **LLM rule evaluation** | **Rule result = `unchecked`** | **No** | **Explicit `unchecked` badge, distinct from pass/fail; does not count toward coverage** |
| Preamble summary | Omit summary | No | Node name only; "show code" expands |
| Fix/clarification suggestions | Action hidden | No (user never sees stale suggestion) | Button absent |
| Comparison: contract-change summary | Skip; UI shows structural diff only | No | Diff hunk shown without one-line narrative |
| Comparison: path-delta narrative | Skip; UI shows position-level changes only | No | Path comparison rendered without per-path summary |
| Comparison: delta-prep questions | Skip; no prep questions surface | No | Empty prep panel for the comparison |
| Comparison: alignment suggestions | Skip; pairings stay strict-identity | No | `net_new`/`net_gone` listed as detected; no "looks like the same path rewritten" hints |

### The `unchecked` rule state

LLM rule results are one of: `pass`, `fail`, `skip` (rule opted out by runner), **`unchecked`** (LLM unavailable and no cache hit). Important properties of `unchecked`:

- It is **never `pass`**. A reviewer looking at a rule showing "unchecked" knows the check did not run.
- It **does not contribute to coverage or completeness metrics**.
- Its visual treatment in the checklist UI is distinct from pass/fail/skip.
- Re-running analysis with LLM enabled resolves it.

## Per-pipeline usage pattern

```ts
// Example: classify.stage2
export async function classifyFileStage2(
  input: Stage2Input,
  deps: { llm: LlmClient; logger: Logger },
  signal: AbortSignal
): Promise<Stage2Output> {
  const result = await deps.llm.call({
    pipeline: 'classify.stage2',
    promptName: 'classify_file',
    model: models.classifyStage2,
    input: { stage1: input.stage1, architecture: input.architecture, file: input.file },
    responseSchema: stage2ResponseSchema,
    signal,
  });

  switch (result.kind) {
    case 'ok':
      return reconcile(input.stage1, result.value);
    case 'disabled':
      if (result.cacheHit) return reconcile(input.stage1, result.value);
      return { classification: input.stage1.classification, confidence: input.stage1.confidence, source: 'stage1' };
  }
}
```

Note the switch has no `default:` — the union is exhaustive, and TypeScript will catch any new `kind`.

## Prompts

- **One file per named prompt** under `apps/server/src/llm/prompts/`.
- Each file exports: `name`, `version`, `buildMessages(input)`, `responseSchema`.
- **Prompts are TS, not markdown**, so IDEs lint, type-check, and jump-to-definition work.
- **Response schemas are defined next to the prompt.** Response shape changes require a version bump.

```ts
// apps/server/src/llm/prompts/classify-file.ts
export const name = 'classify_file' as const;
export const version = '2025-04-21.1' as const;

export const responseSchema = z.object({
  classification: classificationEnum,
  confidence: confidenceEnum,
  justification: z.string().max(200),
});

export function buildMessages(input: Stage2PromptInput) {
  return [
    { role: 'system', content: systemPrompt },     // stable → cached by Anthropic prompt cache
    { role: 'user', content: renderUserMessage(input) },
  ];
}
```

## Concurrency

- **Bounded pool** (default 4) for concurrent LLM calls. Configurable via `user_config.llm_concurrency`.
- **Rate limit handling**: exponential backoff with jitter on 429. Max 3 retries per call. The pool queue blocks on backoff.
- **Cancellation**: queued calls respect the request's `AbortSignal` — cancelling before execution discards the task.

## Observability

- Every LLM call logs (before): `{ pipeline, promptName, promptVersion, model, inputHash }` at `info`.
- Every LLM call logs (after): `{ pipeline, durationMs, source: 'api' | 'cache', tokensIn, tokensOut, costUsdEstimate }`.
- Failures log at `warn` (retry) or `error` (exhausted).
- The UI exposes a "recent LLM activity" view driven by this log stream. See `07-api-surface.md`.

## Enabling/disabling LLM at runtime

- **Startup**: `.env` supplies `ANTHROPIC_API_KEY`. If unset, the client constructs in disabled mode; `call()` returns `disabled` results.
- **Runtime toggle**: `app:setLlmEnabled(enabled: boolean)` procedure. Flips the flag without restart. Does not delete cache.
- **When disabled**, `call()` still reads cache. That's the "previously analyzed, no key now" use case (see `01-architecture.md` principle 4).
- **The UI always knows**. A top-level LLM status chip reflects `{ enabled, cacheSizeBytes, recentCallCount }`.

## Cost kill-switch

- `user_config.llm_daily_cost_cap_usd` (default: unset). If set, the client tracks estimated spend per UTC day and refuses new API calls once the cap is hit. Refused calls return `disabled` (cache reads still work). UI surfaces a warning.
- Estimate uses per-model pricing constants in `apps/server/src/llm/pricing.ts`. This is an estimate, not a billing source of truth.

## Testing

- **Unit tests for the client** use an in-memory fake that returns canned responses keyed by input hash. See `10-testing.md`.
- **Degradation tests** are mandatory: for every pipeline in the table above, there is a test that constructs the LLM client in disabled mode and asserts the documented fallback behavior.
- **Cache-hit-while-disabled tests**: seed the cache DB, construct the client in disabled mode, assert that cached results are served.
- **No test hits the real Anthropic API.** Tests run with `ANTHROPIC_API_KEY` cleared from the env so the client is constructed in disabled mode. To run an LLM-on integration smoke locally, set the key in your shell and re-run; the cache will catch repeat calls.
