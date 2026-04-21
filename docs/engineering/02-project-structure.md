# 02 — Project Structure

## Scope

The monorepo layout, where each kind of code lives, and the rules for what depends on what. This doc is normative — if you find code that violates it, move the code rather than updating the doc.

## Out of scope

Build tooling details (see `11-development-workflow.md`), runtime architecture (see `01-architecture.md`).

## Top-level layout

```
code-walkthroughs/
├── apps/
│   ├── web/                       # Vite + React frontend
│   └── server/                    # Node + Hono + tRPC backend
├── packages/
│   ├── shared/                    # Zod schemas, shared types, utilities
│   ├── analyzer/                  # Pure analysis library
│   └── adapters/                  # Language + framework adapters
├── docs/
│   ├── engineering/               # This doc set
│   └── ...
├── fixtures/                      # Sample codebases for integration tests
├── .env.example
├── biome.json                     # Single root Biome config
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json             # Shared TS config, extended by each package
└── vitest.workspace.ts            # Root Vitest workspace config
```

## Package manifest

| Package | Purpose | Depends on | Publishes |
|---------|---------|------------|-----------|
| `apps/web` | React UI | `@cw/shared` | — |
| `apps/server` | Node server | `@cw/shared`, `@cw/analyzer`, `@cw/adapters` | — |
| `@cw/shared` | Types, Zod schemas, pure helpers | nothing workspace-internal | types + runtime |
| `@cw/analyzer` | Pure analysis pipeline | `@cw/shared`, `@cw/adapters` | runtime |
| `@cw/adapters` | Language + framework adapters | `@cw/shared` | runtime |

**Dependency direction is strict and one-way.** `shared` depends on nothing in the workspace. `adapters` depends only on `shared`. `analyzer` depends on `shared` and `adapters`. `server` depends on all three. `web` depends on `shared` only.

`web` must **never** import from `server`, `analyzer`, or `adapters`. It imports router *types* from `shared` (which re-exports them via a type-only boundary).

## `apps/server` layout

```
apps/server/
├── src/
│   ├── main.ts                    # Entry: boots Hono, attaches tRPC, serves web bundle
│   ├── context.ts                 # tRPC context: session, active codebase, logger
│   ├── session.ts                 # Per-process session state (active codebase, etc.)
│   ├── env.ts                     # Env var parsing (zod-validated)
│   ├── logger.ts                  # pino instance factory
│   ├── db/
│   │   ├── user.ts                # User-level DB connection (config.db)
│   │   ├── codebase.ts            # Codebase-scoped DB factory (state.db + cache.db)
│   │   ├── schema/                # Drizzle schemas (see 04-persistence.md)
│   │   └── migrations/            # Drizzle SQL migrations
│   ├── codebase/
│   │   ├── open.ts                # openCodebase(path) orchestration
│   │   ├── hash.ts                # Stable codebase ID from absolute path
│   │   └── registry.ts            # Recent codebases list (user DB)
│   ├── analysis/
│   │   ├── run.ts                 # Analysis orchestrator (cancellable)
│   │   ├── stages/                # One file per stage (ingest, parse, classify, ...)
│   │   └── events.ts              # Progress event emitter
│   ├── llm/
│   │   ├── client.ts              # Anthropic SDK wrapper (THE ONLY caller)
│   │   ├── cache.ts               # Content-hash cache layer
│   │   ├── degradation.ts         # Degradation contract (see 06-llm-integration.md)
│   │   └── prompts/               # One file per named prompt
│   ├── git/
│   │   └── git.ts                 # execa wrapper for git operations
│   ├── review/
│   │   ├── status.ts              # Status action state machine
│   │   └── comments.ts            # Free-form comments
│   ├── rules/
│   │   ├── loader.ts              # Load user + project rules
│   │   ├── runners/               # builtin.ts, shell.ts, llm.ts
│   │   └── merge.ts               # User ⊕ project rule merge
│   ├── router/
│   │   ├── index.ts               # Root tRPC router
│   │   ├── app.ts                 # Global procedures
│   │   ├── codebase.ts            # Scoped: codebase-level ops
│   │   ├── analysis.ts            # Scoped: analysis status, re-analyze
│   │   ├── walkthrough.ts         # Scoped: walkthrough navigation, node data
│   │   ├── review.ts              # Scoped: status actions, comments
│   │   ├── rules.ts               # Scoped: rule management
│   │   └── progress.ts            # Scoped: progress tracking
│   └── util/
│       ├── abort.ts               # AbortSignal helpers
│       └── hash.ts                # Content hashing helpers
├── test/
│   └── ...                        # Integration tests mirror src/
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Server module rules

- **One responsibility per file.** If a file starts doing two things, split it.
- **`main.ts` is tiny.** It composes pieces. No business logic.
- **Routers under `router/` are thin.** They validate input, resolve context, call a service function, and return. No loops, no conditionals beyond input validation. Business logic lives in `analysis/`, `review/`, `rules/`, etc.
- **No singletons**, except where the type system enforces it (e.g., a single Hono app). Dependencies are passed in — see `03-conventions.md`.

## `apps/web` layout

This is a stub until designs land. The shape will be:

```
apps/web/
├── src/
│   ├── main.tsx                   # Vite entry
│   ├── app.tsx                    # Router root
│   ├── routes/                    # TanStack Router file-based routes
│   ├── features/                  # Feature-scoped UI (walkthrough/, review/, rules/, ...)
│   ├── components/                # Shared UI primitives (shadcn-wrapped)
│   ├── lib/
│   │   ├── trpc.ts                # tRPC client (types from @cw/shared)
│   │   ├── query.ts               # TanStack Query setup
│   │   └── session.ts             # Zustand store for UI session state
│   └── styles/                    # Tailwind entry + tokens
├── .storybook/
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

Full detail in `12-frontend.md` after designs.

## `packages/shared` layout

```
packages/shared/
├── src/
│   ├── index.ts                   # Explicit re-exports; no wildcard
│   ├── types/                     # Plain TS types (no runtime deps)
│   │   ├── codebase.ts
│   │   ├── node.ts
│   │   ├── path.ts
│   │   ├── classification.ts
│   │   ├── review.ts
│   │   └── rule.ts
│   ├── schemas/                   # Zod schemas — single source of truth
│   │   ├── review.ts
│   │   ├── rule.ts
│   │   └── ...
│   ├── router-types.ts            # Type-only re-export of server router
│   └── util/                      # Pure helpers usable anywhere
├── package.json
└── tsconfig.json
```

`router-types.ts` uses `import type` only. It is the bridge from web to server types without web depending on server code.

## `packages/analyzer` layout

```
packages/analyzer/
├── src/
│   ├── index.ts
│   ├── ingest.ts                  # Detect projects inside a codebase
│   ├── parse.ts                   # Dispatch to language adapter's parser
│   ├── classify/
│   │   ├── stage0.ts              # Architectural summary (LLM callback in)
│   │   ├── stage1.ts              # Deterministic classification
│   │   ├── stage2.ts              # LLM augmentation (LLM callback in)
│   │   └── stage3.ts              # Prep-question generation
│   ├── paths/
│   │   ├── detect.ts              # Entry-point detection per adapter
│   │   ├── trace.ts               # Call-graph traversal
│   │   ├── resolve.ts             # Dynamic dispatch resolution
│   │   └── preamble.ts            # Environmental + dispatcher preamble
│   ├── symbols/                   # Cross-file symbol resolution
│   └── types.ts                   # Analyzer-internal shapes
├── test/
└── package.json
```

**The analyzer is pure.** It receives:
- File contents (as strings or a readable map)
- A language adapter instance
- An optional LLM callback (if null, degrades per `06-llm-integration.md`)

It returns plain data. It does no I/O, no DB writes, no network. The server is responsible for fetching file contents, persisting the analyzer's output, and supplying the LLM callback.

## `packages/adapters` layout

```
packages/adapters/
├── src/
│   ├── index.ts
│   ├── adapter.ts                 # The Adapter interface
│   ├── js-ts/
│   │   ├── index.ts               # Exports the JS/TS adapter
│   │   ├── parse.ts               # ts-morph integration
│   │   ├── symbols.ts
│   │   ├── call-graph.ts
│   │   ├── frameworks/
│   │   │   ├── express.ts
│   │   │   ├── fastify.ts
│   │   │   ├── nest.ts
│   │   │   ├── next.ts
│   │   │   ├── remix.ts
│   │   │   └── tanstack-router.ts
│   │   └── classifier-signals.ts  # Stage 1 deterministic signals
│   └── common/
│       └── patterns.ts            # Cross-adapter helpers (path pattern matchers)
├── test/
└── package.json
```

**Each language lives in its own subfolder.** Framework sub-adapters live under the language that hosts them.

## File naming

- **kebab-case** for files and folders: `call-graph.ts`, `stage1.ts`, `path-detect.ts`.
- **PascalCase** for React components: `WalkthroughPanel.tsx`, `NodeStatus.tsx`.
- **One exported concept per file.** If a file exports five unrelated things, split it. Re-export from an `index.ts` at the folder level when you want a grouped public surface.
- **No `index.ts` barrels inside server folders** (beyond where absolutely needed, e.g., the package entry). Explicit imports are easier to trace.

## Import conventions

- Workspace imports use the `@cw/*` alias: `import { classify } from '@cw/analyzer'`.
- Relative imports only within a package.
- Type-only imports use `import type`. This matters for the web/shared/server boundary.
- No circular imports. Biome enforces this; if you hit it, the fix is to move the shared piece into `packages/shared`.

## What *not* to add to this structure

- **A `utils/` or `helpers/` folder at the package root.** Utilities live next to the thing they help. If truly shared, they go in `packages/shared/src/util/`.
- **A `types/` folder alongside code.** Types live next to the code that produces or consumes them, unless they are cross-package (then `packages/shared/src/types/`).
- **A `common/` or `lib/` grab bag.** These fill with junk. Be specific about what a new folder is for.
- **Per-file `.test.ts` siblings in source folders.** Tests mirror source under a parallel `test/` tree. See `10-testing.md`.
