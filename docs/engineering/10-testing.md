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

## Test readability conventions

Tests are read more often than they're written, especially when a future contributor (human or AI) is figuring out how a feature behaves. The conventions below prioritize the reader.

### Naming

- **Test names are sentences that describe behavior.** `'returns disabled when LLM is off and cache misses'`, not `'test1'` or `'classifyStage2 disabled case'`.
- **`describe` blocks name the unit under test plus the context.** `describe('classifyStage2 — LLM disabled', ...)`. The reader should be able to pick out the scenario from the describe + test concatenation alone.
- **No "should" prefix.** Just describe the behavior: `'falls back to stage 1'`, not `'should fall back to stage 1'`.

### Structure: Arrange / Act / Assert

Every test has three blocks, separated by a blank line. Comment markers are encouraged for non-trivial tests:

```ts
test('approves a node and writes through to the DB', async () => {
  // Arrange
  const ctx = createTestContext();
  const caller = createCaller(ctx);
  const node = await seedNode(ctx, { identity: 'proj:src/foo.ts:handle' });

  // Act
  const result = await caller.review.setStatus({
    nodeIdentity: node.identity,
    status: 'approved',
  });

  // Assert
  expect(result.status).toBe('approved');
  const stored = await ctx.codebase.stateDb
    .select()
    .from(reviewStatus)
    .where(eq(reviewStatus.nodeIdentity, node.identity))
    .get();
  expect(stored?.status).toBe('approved');
});
```

The blocks must remain visually separable even without the comments. If Arrange grows past ~10 lines, extract a builder into `test/helpers/`.

### One behavior per test

- **One assertion *focus* per test, not one `expect()`.** A test can have multiple `expect` calls if they all describe the same behavior ("after approve, status is `approved` AND code_hash is captured AND history has one entry"). It cannot use multiple `expect` calls to test multiple unrelated behaviors.
- **If a test name needs an "and," split it.**

### Locators (Playwright + component tests)

- **Locate by role first, by text second, by `data-testid` only when neither works.** `page.getByRole('button', { name: 'Approve' })` is preferred over `page.locator('.approve-btn')`.
- **Never locate by class name or DOM structure.** Both change under refactors; tests then break for the wrong reason.
- **`data-testid` is allowed when the role/text approach is genuinely ambiguous** (e.g., two buttons with the same name in different panels). Prefix the testid with the feature: `data-testid="walkthrough-approve"`.
- **Reuse locator helpers per page.** Instead of `page.getByRole('button', { name: 'Dig in' })` scattered across tests, define `walkthroughPage.digInButton(callName)` once.

### Fixture builders, not inline setup

- **Builders go in `test/helpers/`** and return a fully-typed object. They take an optional partial override.
- **Builders compose.** `seedReviewedPath(ctx, { nodes: 5, approved: 3 })` is a one-line setup that uses lower-level builders for files, nodes, and review rows.
- **No "magic numbers" in fixture builders.** If the test cares about "5 nodes," the literal `5` belongs in the test. If the builder needs a default, name it (`DEFAULT_PATH_LENGTH = 5`).

### Assertions on data, not on logs

- **Don't assert that something was logged** unless the log is part of the contract (e.g., the LLM activity stream that drives the UI's "recent activity" panel).
- **Don't assert on console output** ever. Errors should throw.

### Comments inside tests

- **Comment the *why*, not the *what*.** `// timestamp must be deterministic for the snapshot` is useful. `// call the function` is noise.
- **A comment that explains a non-obvious setup belongs in the Arrange block.**

### What a good test reads like, end to end

```ts
describe('comparison.listRisks', () => {
  test('returns one ContractChange per signature diff with affected callers nested', async () => {
    // Arrange — a base/head pair where validateRequest loses its strict default,
    // and 2 of 4 callers don't pass the argument explicitly
    const comparison = await seedComparison({
      base: { 'src/lib/validate.ts': 'export function validateRequest(req, strict = true) {}' },
      head: { 'src/lib/validate.ts': 'export function validateRequest(req, strict) {}' },
      callers: [
        { file: 'src/routes/a.ts', call: 'validateRequest(req)' },
        { file: 'src/routes/b.ts', call: 'validateRequest(req, false)' },
        { file: 'src/routes/c.ts', call: 'validateRequest(req)' },
        { file: 'src/routes/d.ts', call: 'validateRequest(req, true)' },
      ],
    });

    // Act
    const risks = await createCaller(comparison.ctx).comparison.listRisks();

    // Assert
    expect(risks).toHaveLength(1);
    expect(risks[0].kind).toBe('param_default_removed');
    expect(risks[0].affectedCallers).toHaveLength(4);
    const missing = risks[0].affectedCallers.filter((c) => !c.callPassesArgument);
    expect(missing).toHaveLength(2);
  });
});
```

A reader who has never seen this code can predict what the production behavior is from the test alone. That's the bar.

## AI implementation guards

These are rules the AI implementing this codebase must follow when claiming a chunk of work is done. They exist because "I think it's working" is not the same as "I verified it works."

### After every chunk

Before declaring a chunk complete, run **all** of:

1. `pnpm typecheck` — must pass on every package.
2. `pnpm lint` — must pass clean. No `// biome-ignore` added in this chunk without a one-line justification comment.
3. `pnpm test -- <pattern>` for the test files relevant to the chunk. Must pass.
4. `pnpm test` (full workspace) when the chunk is anything DB-, schema-, or shared-types-related. Cross-package tests are easy to break with a one-character rename.
5. **For UI chunks**: `pnpm dev`, navigate to the affected screen, exercise the golden path **and** at least one edge case (empty, error, LLM-disabled). State explicitly which paths were tested and what was observed.
6. **For UI chunks**: relevant Playwright test must run green. `pnpm test:e2e -- <pattern>`. If no Playwright test covers the new behavior, write one in the same chunk.

### Honesty about UI verification

The AI cannot directly observe a browser. When a chunk touches UI:

- **Don't claim "the page renders correctly"** — that's an unverifiable assertion. State what was tested: "Playwright test `walkthrough.spec.ts > approves a node` passes," and "manual screenshot via `playwright --debug` shows the approve button rendering with the Approve color token."
- **If the user is observing the work**, ask them to confirm visual correctness rather than claiming it. The AI verifies *behavior*; the human verifies *appearance*.
- **Trace and video on by default during implementation.** `apps/web/playwright.config.ts` should set `trace: 'on'` and `video: 'retain-on-failure'` so any failure can be replayed. The AI should mention "the trace at `<path>` shows the failing step" rather than guessing.

### When a check fails

- **Investigate the root cause.** Don't loosen a test, suppress a lint, or skip a typecheck to make the chunk "pass."
- **`--no-verify` is forbidden** unless the user explicitly authorizes it.
- **A flaky failure is a real failure.** Re-running until green is not a verification strategy. See "Flake policy" below.

### What "done" means

A chunk is done when **all** of the following are true:

1. The behavior described in the chunk's plan exists in the code.
2. There is at least one test that would fail if the behavior were removed.
3. All checks listed in "After every chunk" pass.
4. No new TODOs, `@ts-expect-error`, or `// FIXME` were introduced without an issue number reference.
5. The relevant doc(s) were updated in the same chunk if behavior changed (per `README.md` of the engineering doc set).

If any of these are false, the chunk is in progress, not done.

## Bug → regression test rule

**Every bug we find gets a test that would have caught it before we ship the fix.** The test is part of the same commit as the fix; no "I'll add the test later." This is a hard rule, not a suggestion — the value of the bug fix compounds when the test prevents the regression.

The shape:

1. Reproduce the bug as a test that fails on `main`.
2. Apply the fix; the test now passes.
3. Both land in the same commit.
4. The test docstring or comment explains *what bug it caught*, in one or two sentences. Future readers should understand why this specific shape is being asserted, not just that it is.

```ts
// Regression — bug discovered against the express-tiny fixture in chunk 5.5:
// when routes were registered inside a wrapping function, the parser emitted
// both a lexical-scope edge and a handler-attached edge, so the adapter
// counted each route twice. The original test used top-level app.get calls
// where only the handler-attached edge fires, so the bug was invisible.
test('registers routes inside a wrapping function — counts each route once', () => {
  // ...
});
```

### Why this rule exists

- Bugs that escape testing once will escape testing again. The fix without a test is half a fix.
- The diff between "test that catches the bug" and "no test for that case" is usually one or two lines. It's almost free.
- Comments explaining *why* a specific assertion matters keep the test resilient when future refactors change the surrounding shape.

### Use bugs as input to the test-writing workflow, not just the codebase

After fixing, ask one question: **was the original test shape too narrow to catch this?** If so, the fix is more than the bug fix — it's also widening the test to use a more realistic shape. The express adapter bug is the canonical example: the test used the simplest possible Express invocation (top-level `app.get`), and real code uses the wrapped pattern (`function register(app) { app.get(...) }`). The narrower test shape is what let the bug ship. Prefer realistic shapes when adding new tests.

This isn't a hard rule for every test — sometimes the simplest shape is the right shape. But for **integration-style tests of analyzer / adapter / framework behavior**, default to realistic shapes that mirror how real codebases use the API, not the minimum case the API technically permits.

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
