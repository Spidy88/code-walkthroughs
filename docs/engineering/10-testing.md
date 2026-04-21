# 10 — Testing

## Scope

Testing philosophy, tool roles (Vitest, Playwright, Storybook), fixture strategy, and the conventions that make tests trustworthy and fast. This doc defines where tests live, what they cover, and what they don't.

## Out of scope

CI/CD details (covered in `11-development-workflow.md`).

## Principles

1. **Tests follow code.** When code changes, its tests change in the same PR.
2. **Fakes, not mocks.** We construct fake dependencies that implement the real interface. We do not mock modules. See "Fakes" below.
3. **Prefer integration over unit where meaningful.** A test that exercises a service function with a real in-memory SQLite is more valuable than a unit test with ten mocked dependencies. Fast and realistic both win.
4. **Deterministic.** No real network, no real Anthropic API, no wall-clock time. Clocks are injected. Randomness is seeded.
5. **Self-contained.** A test should not depend on another test's state or run order.
6. **Tests are documentation.** A reader of a test should learn how the feature works. Name tests in plain sentences.

## Tool roles

| Tool | Used for |
|---|---|
| **Vitest** | All unit + integration tests across the monorepo |
| **Playwright** | End-to-end tests hitting the running web + server |
| **Storybook** | Component-level UI development + visual regression |
| **Vitest + ts-morph fixtures** | Analyzer tests (parse real TS files, assert output) |
| **Better-SQLite3 in-memory mode** | DB integration tests |

### What goes where

- **Pure functions** (most of `analyzer`, `shared`, `adapters`) → Vitest unit tests.
- **Service functions** in `server/` (DB + logic) → Vitest integration tests with in-memory SQLite.
- **tRPC procedures** → Vitest with a test caller (no HTTP). See below.
- **UI components** → Storybook stories + Vitest component tests via `@vitest/browser`.
- **Full user flows** (open codebase, walk path, approve node, see progress update) → Playwright.

## Test layout

```
apps/server/
├── src/
└── test/
    ├── fixtures/               # Test-only fixtures not shared across packages
    ├── analysis/               # Mirrors src/analysis/
    ├── review/                 # Mirrors src/review/
    ├── router/
    └── helpers/
        ├── db.ts               # createTestDbs() → in-memory DB pair
        ├── llm.ts              # createFakeLlm(responses) → fake LlmClient
        ├── git.ts              # createGitRepo(path) → helpers for test repos
        └── context.ts          # createTestContext(overrides) → ScopedContext
```

Each package follows this pattern: `src/` for code, `test/` for tests. Tests **mirror** the source tree.

**No `*.test.ts` files alongside source.** This keeps source folders readable and mirrors the conventions of larger projects where test layout is shared.

**Shared fixtures** (sample codebases used across packages) live in the repo root `fixtures/` folder:

```
fixtures/
├── js-ts/
│   ├── express-basic/
│   ├── next-app-router/
│   ├── nest-controllers/
│   └── ...
└── git/
    └── rename-detection/      # a pre-committed git history for rename tests
```

Fixtures are real code, not snippets. They must run through the analyzer without errors.

## Vitest configuration

- One `vitest.workspace.ts` at the repo root enumerates each package's config.
- Each package has a `vitest.config.ts` setting its environment (`node` for server/analyzer/adapters/shared, `jsdom` or `@vitest/browser` for web).
- Coverage is reported per package, aggregated at the root. Coverage targets are **guidelines, not gates** — we don't fail CI on a 1% dip.

## Fakes

A fake implements the real interface of a dependency. It is typed. Constructing a fake is a one-liner in tests.

```ts
// apps/server/test/helpers/llm.ts
export function createFakeLlm(
  responses: Map<string, unknown>
): LlmClient {
  return {
    async call(options) {
      const key = hashInput(options);
      if (responses.has(key)) {
        return { kind: 'ok', value: responses.get(key), source: 'cache' };
      }
      return { kind: 'disabled', cacheHit: false };
    },
    // ...
  };
}
```

- **Never use `vi.mock`** on a module we own. If a dependency is hard to fake, the code has a seam problem — fix the seam.
- **`vi.mock` is allowed for pure npm dependencies** (e.g., filesystem libraries) only when there is no practical fake, and only at the edge of our code.

### The test context helper

```ts
export function createTestContext(overrides: Partial<ScopedContext> = {}): ScopedContext {
  return {
    logger: silentLogger(),
    session: createTestSession(),
    userDb: createInMemoryUserDb(),
    llm: createFakeLlm(new Map()),
    clock: () => new Date('2026-04-21T00:00:00Z'),
    abortSignal: new AbortController().signal,
    codebase: createTestCodebase(),
    ...overrides,
  };
}
```

Every service test starts from this. Overrides are explicit — a test that cares about time passes its own clock.

## Database tests

- **In-memory SQLite per test**. `better-sqlite3` supports `:memory:`. Migrations run on creation.
- **Isolated**. Each test gets its own DB pair; no shared state.
- **Seed helpers** live in `test/helpers/db-seed.ts`. Seeds are small and explicit ("create a codebase with 3 files, 5 functions, 1 approved status"). No "realistic big seed."

## tRPC procedure tests

Use tRPC's test caller instead of spinning up HTTP.

```ts
import { createCaller } from 'apps/server/src/router';

const ctx = createTestContext({ /* overrides */ });
const caller = createCaller(ctx);

const result = await caller.review.setStatus({
  nodeIdentity: 'project-a:src/foo.ts:handleRequest',
  status: 'approved',
});

expect(result.status).toBe('approved');
```

This exercises the full middleware chain + handler + service, in-process.

## Analyzer tests

- **Inputs**: fixture files under `fixtures/`.
- **Assertions**: the analyzer's output data structure. Compare against a snapshot or against explicit expected values (prefer explicit).
- **Snapshots are used** for large outputs (call graphs, path lists) where a human reading the test can inspect changes. Keep snapshots small; if one grows past ~30 lines, write explicit assertions instead.

## UI tests

### Storybook

- Every non-trivial component has at least one story.
- Stories exercise realistic states — use the same kinds of payloads the real API returns. MSW or a fake tRPC client supplies data.
- Stories include **edge cases**: empty, loading, error, and the "LLM disabled" variant where applicable.
- **Visual regression**: Storybook Chromatic or Playwright screenshot comparison can run in CI if/when we decide to pay the maintenance cost. Not required for v1.

### Component tests (Vitest browser mode)

- Assert on **behavior**, not structure. "Clicking approve sends the right payload" > "the button has this class."
- Use the fake tRPC client.
- Render via a thin test-wrapper that provides router + query-client + fake-trpc context.

### Playwright E2E

- Small number of flows. Quality over quantity.
- Each flow covers a **real user journey**: open codebase → walk path → approve a node → see progress update.
- E2E runs against `pnpm dev` with a seeded fixture codebase (`fixtures/js-ts/express-basic/`).
- LLM is disabled in E2E by default. A separate `e2e:llm` target runs a subset with `ANTHROPIC_API_KEY` set; gated by an env flag; not part of the default CI pipeline.

## Degradation tests

**Every LLM-using pipeline has a degradation test.** See `06-llm-integration.md`.

Pattern:

```ts
describe('classify.stage2 — LLM disabled', () => {
  test('falls back to stage 1 classification', async () => {
    const ctx = createTestContext({ llm: createFakeLlm(new Map()) }); // empty => always disabled
    const result = await classifyFileStage2(input, ctx, ctx.abortSignal);
    expect(result.source).toBe('stage1');
  });

  test('serves cached response when LLM disabled but cache populated', async () => {
    const cached = { classification: 'service', confidence: 'high', justification: '...' };
    const ctx = createTestContext({
      llm: createFakeLlm(new Map([[hashInput(expectedOptions), cached]])),
    });
    const result = await classifyFileStage2(input, ctx, ctx.abortSignal);
    expect(result.source).toBe('stage2');
  });
});
```

## What we don't test

- **Third-party library internals** (Drizzle, Hono, tRPC, TanStack Router). They have their own tests. We test our usage.
- **Throwaway log output**. We don't assert on `logger` calls unless a specific log is part of the contract.
- **UI pixel precision**. We assert behavior; visual regression is separate.
- **Real-world LLM output quality**. We test the plumbing (request built correctly, response parsed, cache works, degradation works). Prompt quality is evaluated by eyeballing results during development, not asserted in CI.

## Flake policy

- A test that flakes is broken, not "sometimes failing." Open an issue, mark it `test.skip` with a reference to the issue, fix it.
- No retry-on-failure in CI. A retry mechanism hides real bugs.

## Running tests

- `pnpm test` — runs the full Vitest workspace.
- `pnpm test -- <pattern>` — filtered run.
- `pnpm test:e2e` — Playwright.
- `pnpm storybook` — dev mode.
- `pnpm typecheck` — TS project-wide.
- `pnpm lint` — Biome.

See `11-development-workflow.md` for the full script reference.
