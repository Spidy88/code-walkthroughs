# 12 — Frontend

## Scope

The frontend architecture: routing, state, data fetching, component organization, and styling. This doc is a **stub** until designs are available. The stable pieces (data contracts, tech choices) are captured now; layout, visual hierarchy, and per-view behavior will be filled in after design review.

## Status

- [x] Tech stack confirmed
- [x] Data contracts defined (tRPC router in `07-api-surface.md`)
- [x] State ownership model described
- [ ] Route inventory — drafted below; expect changes after design review
- [ ] Per-view component specs — deferred to post-design
- [ ] Interaction patterns (dig-into affordance, path navigation, conflict prompts) — deferred
- [ ] Empty, loading, error, LLM-disabled UI states per view — deferred
- [ ] Keyboard shortcuts — deferred
- [ ] Accessibility requirements — deferred

## Tech stack

| Concern | Choice |
|---|---|
| Build | Vite |
| Framework | React 19 |
| Language | TypeScript (strict) |
| Routing | TanStack Router (file-based, type-safe search params) |
| Server state | TanStack Query (via tRPC React bindings) |
| Client state | Zustand (per-feature stores; no global store) |
| Styling | Tailwind v4 + shadcn/ui primitives |
| Component dev | Storybook |
| Testing | Vitest (component + unit), Playwright (E2E) |
| Lint/format | Biome |
| Icons | lucide-react |

No Redux, no Recoil, no CSS-in-JS, no styled-components, no emotion.

## State ownership

Three kinds of state, three homes:

1. **Server state** (anything that came from the backend): TanStack Query. Cache keys follow tRPC's conventions. Invalidations are explicit per mutation.
2. **URL state** (current route, active path, active node, filters): TanStack Router search params. This makes walkthrough positions deep-linkable and shareable across browser sessions.
3. **Local UI state** (open panels, draft comment text, hover states): local component state (`useState`) or a feature-scoped Zustand store when state needs to cross component boundaries within a feature.

**Rules**:

- Never duplicate server state in Zustand. If it came from the server, it lives in TanStack Query.
- URL state is truth for things that should survive a reload. "What path am I on, which node, what dig-into stack" — all URL.
- Zustand stores are **per-feature**, not global. E.g., `features/walkthrough/store.ts` owns walkthrough-only UI state.

## Data fetching

- Every server interaction goes through the tRPC client.
- Queries use `useQuery` / `useSuspenseQuery`. Mutations use `useMutation` with explicit invalidation.
- **Optimistic updates** only where the mutation is fast and obviously correct — e.g., taking a status action. The mutation handler mirrors the server's logic locally, then reconciles on response.
- **Error boundaries** catch render errors; tRPC errors surface through the query result and are rendered per view. No silent failures.

## Route inventory (draft)

Planned routes. Subject to change after design review.

| Path | Purpose |
|---|---|
| `/` | Landing: if no active codebase, show picker. Else redirect to `/codebase`. |
| `/codebase` | Active codebase overview: projects, analysis status, progress summary, prep queue entry. |
| `/codebase/prep` | Prep pass view: list and answer open questions. |
| `/codebase/rules` | Rule management (user + project scope). |
| `/codebase/settings` | Codebase-level settings. |
| `/project/$projectId` | Project overview: path categories, synthetic walkthroughs, progress, file browser entry. |
| `/project/$projectId/browse` | File browser. |
| `/project/$projectId/browse/$filePath` | File detail / free review. |
| `/project/$projectId/path/$pathId` | Walkthrough view. Search params: `node`, `digStack`, `scope`. |
| `/project/$projectId/synthetic/$synthId` | Synthetic walkthrough view. |
| `/settings` | User-level settings (LLM, cost cap, rename threshold, concurrency). |

All nested routes preserve context via TanStack Router's layout routes. Breadcrumbs are derived from the route match tree.

## Feature folders

```
apps/web/src/features/
├── codebase/         # codebase picker, overview, open/switch
├── walkthrough/      # path navigation, node display, dig-into stack
├── review/           # status actions, comments, history
├── rules/            # rule list, editor, evaluate
├── prep/             # prep question list + composer
├── progress/         # progress bars, scope drilldowns
├── analysis/         # re-analyze controls, status banner, event stream
└── llm-status/       # LLM on/off banner, cache stats, activity panel
```

Each feature folder contains its components, hooks, store (if any), and local utilities. Features import from `components/` and `lib/`; they do not import from each other.

## Shared primitives

```
apps/web/src/components/
├── ui/               # shadcn-wrapped primitives (Button, Dialog, Tabs, ...)
├── code/             # syntax-highlighted code view, diff view, line anchor
├── review/           # status badges, comment bubble (reusable across features)
└── layout/           # page shell, sidebars, breadcrumb
```

## Components: conventions

- **Named exports only.**
- **One component per file.**
- **Props use `type`, never `interface`.**
- **Local state via `useState`; cross-component state via hooks that read from the feature store.**
- **No inline `if (isLoading) return <Spinner />` cascades.** Use `Suspense` + skeleton components. Each route component has a matching skeleton.
- **Accessibility**: use shadcn primitives, which are Radix-based. Label every interactive element. Keyboard shortcuts must have a visible hint on hover / in a help overlay.

## Styling

- Tailwind v4 with a design-token layer that mirrors shadcn's conventions.
- Colors, spacing, radii, and typography scales are defined in `apps/web/src/styles/tokens.css`. No magic numbers in components.
- **No inline styles** except for truly dynamic values (e.g., a computed grid template).

## Error and loading states

Every route must handle all of:

1. **Loading** (suspended on initial data).
2. **Error** (query failed — network, server error).
3. **Empty** (no data to show — e.g., codebase with no paths detected).
4. **LLM-disabled** (where the view's usefulness degrades; see the degradation contract).
5. **Stale / changed** (for review-oriented views; shows prior status + diff).

These five states are part of the component spec, not afterthoughts. Storybook stories cover all of them.

## Keyboard shortcuts (placeholder)

To be designed alongside the UI. Expected shortcuts:

- `j` / `k` — next / previous node on current path.
- `a` / `r` / `i` — approve / reject / request info.
- `d` — dig into highlighted call.
- `[` / `]` — dig-into stack pop / next fork.
- `/` — jump to file search.
- `?` — shortcut overlay.

Placement and final mappings depend on design.

## Open items for the design pass

These will be answered when designs land. Flagged here so nobody is surprised:

1. How is the walkthrough's "current node" visually anchored vs. the full file context?
2. How is the dig-into stack visualized? Breadcrumb, stack panel, modal?
3. How do status badges differ for `reviewed_current` vs `reviewed_stale` vs `info_requested`?
4. How are path categories displayed in the project overview — as tabs, sidebar, collapsible sections?
5. How does the reviewer trigger a file-level cascade? What does the conflict prompt look like?
6. How is LLM-disabled surfaced — persistent banner, chip, or only contextual indicators?
7. What does the prep question composer look like — modal, inline, or side panel?
8. Empty states: first-time codebase open, all paths completed, nothing to review.

Each of these has an implementation implication, but none blocks backend work.
