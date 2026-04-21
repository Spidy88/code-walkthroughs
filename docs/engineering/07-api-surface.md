# 07 — API Surface

## Scope

The tRPC router layout, conventions for procedures, the active-codebase context, and how the web consumes types without depending on server code.

## Out of scope

Per-procedure business logic (lives in service modules referenced by routers). Transport details (tRPC over HTTP via Hono; no custom transport).

## Why tRPC

- End-to-end types with no code generation step.
- Input and output types live in one place (Zod schema + handler return type).
- The web client autocompletes the server's entire API.
- Debuggable: procedures are HTTP under the hood, reachable via curl or the browser devtools.

## Router layout

```
apps/server/src/router/
├── index.ts          # Root router, composes the rest
├── app.ts            # Global procedures (no active codebase required)
├── codebase.ts       # Codebase lifecycle (open, close, info, switch)
├── analysis.ts       # Analysis control + progress subscription
├── walkthrough.ts    # Path navigation, node fetching, dig-into
├── review.ts         # Status actions, comments, history
├── rules.ts          # Rule CRUD (user + project scope)
├── prep.ts           # Prep questions and answers
├── progress.ts       # Progress queries and resets
└── llm.ts            # LLM status, cost, recent activity
```

## Context

tRPC context is built per-request in `apps/server/src/context.ts`.

```ts
export type BaseContext = {
  readonly logger: Logger;
  readonly session: Session;         // per-process singleton
  readonly userDb: UserDb;
  readonly llm: LlmClient;
  readonly clock: () => Date;
  readonly abortSignal: AbortSignal; // from the request
};

export type ScopedContext = BaseContext & {
  readonly codebase: ActiveCodebase; // includes stateDb and cacheDb handles
};
```

### Middleware

- **`baseProcedure`** — no guards; runs every procedure.
- **`scopedProcedure`** — asserts an active codebase is attached to the session; throws `TRPCError({ code: 'PRECONDITION_FAILED' })` if not.
- **`writeProcedure`** — extends `scopedProcedure`; wraps the handler in a transaction on `state.db`.

No custom auth middleware in v1 (single-user, local). The reviewer ID is attached by `baseProcedure` from session config and is always present.

## Procedure conventions

- **Names are dot-namespaced.** Router file defines the prefix: `walkthrough.getNode`, `review.setStatus`.
- **Input is validated by a Zod schema from `packages/shared/src/schemas/`.** No inline schemas for non-trivial inputs.
- **Output type is inferred.** Do not declare it explicitly unless you need to narrow it.
- **Handlers are thin.** They resolve context, call a service function, return. No business logic in the router.

```ts
// router/review.ts
export const reviewRouter = router({
  setStatus: writeProcedure
    .input(setStatusInputSchema)
    .mutation(async ({ ctx, input }) => {
      return setNodeStatus(input, { ctx });
    }),

  getHistory: scopedProcedure
    .input(z.object({ nodeIdentity: z.string() }))
    .query(async ({ ctx, input }) => {
      return getNodeHistory(input.nodeIdentity, { ctx });
    }),
});
```

- **Queries are idempotent, mutations are not.** Never hide a write in a query.
- **Subscriptions are used only for streaming events** (analysis progress, LLM activity). Everything else is query or mutation.

## Error handling in procedures

- Service functions throw domain errors.
- The router layer catches known domain errors and translates to `TRPCError` codes.
- Unknown errors bubble to tRPC's default handler, which logs them at `error` and returns a generic message to the client. The UI shows a copy-to-clipboard trace via a dev panel.

Known translations live in `apps/server/src/router/errors.ts` as a single table, not scattered.

## Global procedures (`app.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `app.getBootstrap` | query | Initial payload: version, LLM status, recent codebases, active codebase (if any) |
| `app.setLlmEnabled` | mutation | Runtime toggle (see `06-llm-integration.md`) |
| `app.getLlmStatus` | query | Current LLM status + cache stats |

## Codebase procedures (`codebase.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `codebase.openCodebase` | mutation | `{ path }` → activates this codebase; kicks off ingestion |
| `codebase.closeCodebase` | mutation | Detach the active codebase from the session |
| `codebase.getActive` | query | Info about the active codebase (or null) |
| `codebase.listRecent` | query | From `user.db.recent_codebases` |
| `codebase.setLabel` | mutation | `{ hash, label }` |

## Analysis procedures (`analysis.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `analysis.start` | mutation | Runs full analysis (or resumes partial) |
| `analysis.reanalyze` | mutation | `{ force?: boolean }` — re-runs with cache invalidation where requested |
| `analysis.cancel` | mutation | Aborts in-flight analysis |
| `analysis.getStatus` | query | `{ stage, progress, lastRunAt, lastError }` |
| `analysis.onEvent` | subscription | Streams `AnalysisEvent` (see `05-analysis-pipeline.md`) |
| `analysis.setComparison` | mutation | `{ baseRef, headRef } | null` — sets commit-range comparison (see `09-reanalysis.md`) |

## Walkthrough procedures (`walkthrough.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `walkthrough.listProjects` | query | Projects in the active codebase |
| `walkthrough.listPaths` | query | `{ projectId, filter? }` — returns paths with category ordering |
| `walkthrough.listEntryPoints` | query | Entry points + framework metadata |
| `walkthrough.getPath` | query | Path metadata + ordered node list |
| `walkthrough.getNode` | query | Full node payload: code, classification, checklist, review state, downstream calls |
| `walkthrough.getPreamble` | query | `{ entryPointId }` |
| `walkthrough.listSyntheticWalkthroughs` | query | Non-path sequences |

## Review procedures (`review.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `review.setStatus` | mutation | Approve / reject / info-request a node. Input validates that `info_requested` has a comment |
| `review.clearStatus` | mutation | Revert to pending; prior status moves to history |
| `review.getHistory` | query | Node status history |
| `review.promoteScopedApproval` | mutation | Turn a path-scoped approval into a global one (see `08-review-state.md`) |
| `review.setFileStatus` | mutation | File-level cascade action (see `08-review-state.md` for conflict prompt) |
| `review.addComment` | mutation | Anchor kinds: `file`, `function`, `line` |
| `review.updateComment` | mutation | |
| `review.deleteComment` | mutation | |
| `review.listComments` | query | `{ anchor }` |

## Prep procedures (`prep.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `prep.listQuestions` | query | Unanswered prep questions for the codebase |
| `prep.getQuestion` | query | Single question by key |
| `prep.answerQuestion` | mutation | Stores answer; propagates into cache (e.g., resolving a classification) |
| `prep.getQuestionStats` | query | `{ total, answered, remaining }` for progress UI |

## Rules procedures (`rules.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `rules.list` | query | Effective rules for a classification (merged user + project) |
| `rules.listAll` | query | All rules by scope |
| `rules.create` | mutation | |
| `rules.update` | mutation | |
| `rules.delete` | mutation | |
| `rules.toggle` | mutation | Enable/disable |
| `rules.evaluate` | mutation | Run a rule against a node (on-demand) |

## Progress procedures (`progress.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `progress.getCodebase` | query | Aggregate across active codebase |
| `progress.getProject` | query | `{ projectId }` |
| `progress.getPath` | query | `{ pathId }` |
| `progress.getFile` | query | `{ filePath }` |
| `progress.reset` | mutation | `{ scope: 'codebase' \| 'project' \| 'path' \| 'file', id? }` |

## LLM procedures (`llm.*`)

| Procedure | Kind | Purpose |
|---|---|---|
| `llm.getStatus` | query | Enabled, cache size, daily spend, cap |
| `llm.setDailyCap` | mutation | |
| `llm.listRecentActivity` | query | Last N calls (from log) |
| `llm.clearCache` | mutation | `{ pipeline?: PipelineName }` — clears scoped cache entries |

## Exposing types to the web

`packages/shared/src/router-types.ts`:

```ts
export type { AppRouter } from '../../../apps/server/src/router';
// type-only; no runtime import of server code
```

The web's `lib/trpc.ts` imports `AppRouter` as a type and instantiates `createTRPCReact<AppRouter>()`. No server runtime leaks into the bundle. This works because the tsconfig project reference sets `"emitDeclarationOnly": false` for server and `"declaration": true` — shared picks up the generated types.

## Transport

- tRPC mounted at `/trpc` in Hono via `@hono/trpc-server`.
- HTTP-only; no WebSocket. Subscriptions use SSE (tRPC's built-in transport option).
- CORS disabled in prod (same-origin). In dev, allowed for the Vite origin.

## Versioning

No explicit API version in v1. The web and server ship together. If we ever split deployment, we introduce a version header and a compatibility window.
