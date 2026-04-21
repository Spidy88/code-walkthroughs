# 03 — Conventions

## Scope

How we write code in this repo. Style, error handling, logging, naming, commenting, and the patterns that repeat across the codebase. Read this before writing new code. Cite this doc in code review when you see drift.

## Out of scope

What the code does (other docs). Lint/format tool configs (live in `biome.json`).

## TypeScript

- **`strict: true`.** Also `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- **No `any`.** If you reach for it, you likely need a narrower type or a `z.unknown()` parse step. `unknown` is the right fallback at system boundaries.
- **No non-null assertions (`x!`).** Either the type is wrong or you need a real guard.
- **Use `type`, not `interface`**, unless you need declaration merging (rare; framework augmentation only).
- **Use `readonly` on properties** that shouldn't change after construction. Use `ReadonlyArray<T>` when you hand out an array you don't want mutated.
- **Discriminated unions for state.** If a value is "pending | loading | error | done," model it as a union with a `kind` tag, not an object with four optional fields.

## Zod and input validation

- **One Zod schema per external contract**, defined in `packages/shared/src/schemas/`.
- **Derive types from schemas**, not the other way around: `type Foo = z.infer<typeof fooSchema>`. Do not redeclare.
- **Validate at boundaries.** tRPC procedures validate their input via Zod. Config files are Zod-validated on load. Anything arriving from disk or the network is validated before use.
- **Do not re-validate internally.** Once data is parsed at the boundary, its type is trusted. Validating twice is a smell.

## Functions and modules

- **Functions do one thing.** If you need to describe your function with "and," split it.
- **Prefer pure functions in `analyzer/`, `shared/`, and `adapters/`.** Impurity lives in `apps/server/`.
- **Dependency injection via function arguments, not imports.** If a function needs a DB handle, take it as a parameter; do not import a global. This keeps tests trivial and makes the call graph legible.

```ts
// Good
export async function openCodebase(
  path: string,
  deps: { userDb: UserDb; logger: Logger; now: () => Date }
): Promise<Codebase> { /* ... */ }

// Bad — hides dependencies, hostile to tests
import { userDb } from './db/user';
import { logger } from './logger';
export async function openCodebase(path: string): Promise<Codebase> { /* ... */ }
```

The one exception: truly global, truly stateless utilities (`hash`, `formatDate`) can be imported directly.

- **No default exports.** Named exports only. Default exports make grepping harder and encourage rename drift.
- **Co-locate tightly-coupled code.** A file and its types live together. A feature and its sub-files live in one folder.

## Error handling

Three categories, described in `01-architecture.md`. The implementation rules:

- **Throw `Error` subclasses with meaningful names.** Define them near where they are thrown.

```ts
export class CodebaseNotFoundError extends Error {
  readonly code = 'CODEBASE_NOT_FOUND' as const;
  constructor(readonly path: string) {
    super(`No codebase found at ${path}`);
  }
}
```

- **tRPC procedures translate domain errors to `TRPCError`** at the edge — never inside business logic.
- **Never `catch` to continue.** `catch` blocks either:
  - Rethrow with more context (wrapping is fine; swallowing is not).
  - Convert to a domain result (e.g., "rule runner returned `unchecked` because the shell command exited nonzero").
  - Log and rethrow (reserved for the top-level handler).
- **No `try/catch` around non-throwing code** (e.g., `JSON.parse` on data you just serialized yourself). It's noise.
- **Return a `Result<T, E>` type instead of throwing** when the caller routinely wants to branch on success/failure. Prefer throwing when failure is exceptional.

## Logging

- **Use the injected logger.** Never `console.log` in committed code. Biome blocks it.
- **Structured fields, not string interpolation.**

```ts
logger.info({ codebaseId, projectCount }, 'codebase opened');
// Not: logger.info(`codebase ${codebaseId} opened with ${projectCount} projects`);
```

- **Log levels**:
  - `trace`: rarely used; noisy internal state.
  - `debug`: detailed step-by-step; off in production-like runs.
  - `info`: lifecycle events (codebase opened, analysis started, LLM call issued).
  - `warn`: degraded paths (LLM disabled, cache miss that fell back, partial analysis).
  - `error`: bugs, invariant violations, unexpected exceptions.
- **Always include the codebase ID** when logging inside a codebase-scoped operation. Log context comes from tRPC middleware.

## Naming

- **Functions are verbs.** `classifyFile`, `openCodebase`, `resolveDispatch`. Not `fileClassifier`, `classification`.
- **Booleans read as questions.** `isApproved`, `hasPending`, `canReanalyze`. Not `approved` alone (ambiguous noun).
- **Types are nouns.** `Codebase`, `NodeStatus`, `ClassificationConfidence`.
- **Avoid generic names.** `handleData`, `process`, `manager`, `service` (as a suffix) are red flags. Name after the specific thing.
- **Spell things out.** `connection` not `conn`, `database` not `db` in identifiers that leave internal scope. `db` is allowed for tightly-scoped local handles. `req`/`res` are allowed inside route handlers.

## Comments

Default to **no comments**. Only add one when the *why* is non-obvious:

- A hidden constraint ("ts-morph reuses node identities across reparses; we key by id to exploit that").
- A subtle invariant ("this runs before Stage 2 so the order of writes matters").
- A workaround ("Node's sqlite driver throws on BEGIN IMMEDIATE inside transactions; use deferred").
- Behavior that would surprise a careful reader.

Never comment *what* the code does (good names and types already do that). Never leave TODOs without a ticket or a specific person's name and a date. Never reference prior versions ("removed the X flow," "used to call Y") — that's what git history is for.

## Commit and PR conventions

- **Conventional commit prefixes**: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`. Keep subjects under 72 chars.
- **Each commit is independently buildable and lint-clean.** We don't rebase-fix lint issues after the fact.
- **PRs update docs in the same change as the behavior.** A PR that changes how classification works and does not touch `05-analysis-pipeline.md` is incomplete.

## Patterns that repeat

### Cancellable operations

Any operation that touches the filesystem, LLM, or git, and any loop over more than a trivial number of items, takes an `AbortSignal` and respects it.

```ts
export async function runAnalysis(
  codebase: Codebase,
  deps: AnalysisDeps,
  signal: AbortSignal
): Promise<void> {
  for (const file of codebase.files) {
    signal.throwIfAborted();
    await parseFile(file, deps, signal);
  }
}
```

Helpers live in `apps/server/src/util/abort.ts`.

### Dependency bundles

When a function needs three or more dependencies, pass them as a `deps` object, not positional args. Define the deps type next to the function.

```ts
type OpenCodebaseDeps = {
  readonly userDb: UserDb;
  readonly logger: Logger;
  readonly now: () => Date;
};

export async function openCodebase(
  path: string,
  deps: OpenCodebaseDeps
): Promise<Codebase> { /* ... */ }
```

### Testing seams

Every function with dependencies is trivially testable because dependencies are explicit. Never mock modules; construct fake deps. See `10-testing.md`.

### "Do it right, do it once, do it in one place"

If a pattern repeats three times, lift it. If it repeats twice, don't — wait for the third. Premature abstraction is the larger risk.

## Extending the codebase — the canonical recipes

These are the patterns Claude should follow when asked to add a new X. Each has a named home.

### Add a new classification

1. Add the classification to the enum in `packages/shared/src/types/classification.ts`.
2. Add deterministic signals to `packages/adapters/src/js-ts/classifier-signals.ts` (or the relevant adapter).
3. Add a default checklist entry in the project-level rules file template (see `09-rules` section in `05-analysis-pipeline.md`).
4. Add tests under `packages/analyzer/test/classify/`.

### Add a new framework sub-adapter (JS/TS)

1. Create `packages/adapters/src/js-ts/frameworks/<framework>.ts` implementing the `FrameworkAdapter` interface.
2. Register it in `packages/adapters/src/js-ts/index.ts`.
3. Add fixtures under `fixtures/js-ts/<framework>/` and tests under `packages/adapters/test/js-ts/frameworks/<framework>.test.ts`.

### Add a new language adapter

1. Create `packages/adapters/src/<lang>/index.ts` implementing the `Adapter` interface.
2. Register its detection in `packages/analyzer/src/ingest.ts`.
3. Add fixtures and tests.

### Add a new rule runner tier

v1 ships three (built-in, shell, LLM). A new tier requires:

1. A runner under `apps/server/src/rules/runners/<tier>.ts` implementing the `RuleRunner` interface.
2. Registration in `apps/server/src/rules/loader.ts`.
3. Documentation in `05-analysis-pipeline.md`.

### Add a new LLM-using pipeline

See `06-llm-integration.md`. Every LLM pipeline must declare its degradation mode in the degradation contract table. A PR that adds an LLM call without updating that table will be rejected.

### Add a new tRPC procedure

See `07-api-surface.md`. The short version: pick the right router file, validate input with a shared schema, keep the handler thin, call a service function.

## Things we do not do

- **Do not write backwards-compat shims for code that no one depends on yet.** It's v1; there is no "before."
- **Do not add feature flags for every new feature.** Change the code.
- **Do not add configuration for things no user will ever configure.** Defaults are features.
- **Do not introduce a build step for a config file** (YAML, TOML, JSON-with-comments). Project config is `walkthrough.config.ts`, evaluated by the server.
- **Do not use class-based OOP as a structuring principle.** Classes exist for Error subclasses and where a library forces our hand (Drizzle, TanStack). Everything else is functions + types.
- **Do not roll our own when a well-maintained library exists** (hashing, path manipulation, glob matching, diff computation). We are not shipping these at scale; we are assembling them cleanly.
