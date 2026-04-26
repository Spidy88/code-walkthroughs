# 12 — Frontend

## Scope

The frontend architecture: routing, state, data fetching, component organization, and styling. The visual language and component patterns are defined in `14-design-system.md` (Blueprint Draft); the screen inventory and user-flow model are defined in `/docs/design/spec.md`. This doc covers behavior, structure, and how the frontend stitches into the rest of the system.

## Status

- [x] Tech stack confirmed
- [x] Data contracts defined (tRPC router in `07-api-surface.md`)
- [x] State ownership model described
- [x] Route inventory — derived from `/docs/design/spec.md` sitemap
- [x] Visual language and design tokens — see `14-design-system.md`
- [x] Component patterns (Tier-0 through Tier-2) — see `14-design-system.md`
- [x] Walkthrough surface model — xyflow canvas; see `/docs/design/spec.md` §4
- [ ] Per-view layouts for sitemap screens — pending visual design
- [ ] Comparison-mode visual design (Comparison Overview, Path Delta Comparison, Contract Change detail) — pending; see `/docs/design/spec.md` §5
- [ ] Keyboard shortcuts — placeholder list below; finalized during implementation
- [x] Accessibility requirements — see `14-design-system.md`

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
| Canvas (walkthroughs + path comparison) | `@xyflow/react` |
| Canvas layout | `dagre` (v1; horizontal tree layout). `elkjs` reserved as upgrade path if dagre's layouts are insufficient. |
| Component dev | Storybook |
| Testing | Vitest (component + unit), Playwright (E2E) |
| Lint/format | Biome |
| Icons | lucide-react |

No Redux, no Recoil, no CSS-in-JS, no styled-components, no emotion.

### Why xyflow for the walkthrough surface

The walkthrough is rendered on an **infinite canvas** as a horizontal tree of nodes. See `/docs/design/spec.md` §4 for the full rationale; the short version: the data is a graph, dig-into navigation is naturally spatial, forks and cycles become visible, and comparison mode renders cleanly as paired canvases.

xyflow is the foundation. We use:

- Custom node types wrapping our Blueprint primitives (see `14-design-system.md` Tier-2 canvas components).
- Custom edge types for resolved / unresolved / handler-attached / comparison-matched / dig-into edges.
- Built-in pan, zoom, fit-to-view, mini-map.
- Deterministic horizontal-tree layout via `dagre` — no manual positioning; the layout is computed from the call graph.
- Focus state for the current node, persisted in URL search params for deep-linking.

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

## Route inventory

Routes derive from the sitemap in `/docs/design/spec.md` §5. Each route maps to one or more screens in that sitemap. TanStack Router file-based routing.

| Path | Sitemap screen | Purpose |
|---|---|---|
| `/` | Codebase Picker | Landing: select a codebase to ingest, or resume a recent codebase. |
| `/codebase/analyzing` | Analysis Progress | Per-project analysis progress; prep available in parallel. |
| `/codebase/prep` | Prep Pass | Triage queue for unresolved questions. |
| `/codebase` | Project Overview (when single-project codebase) | Auto-redirects to the single project's overview. |
| `/project/$projectId` | Project Overview | Path categories, synthetic walkthroughs, progress, file browser entry, remaining prep. |
| `/project/$projectId/browse` | File Browser | File tree with classification + status badges. |
| `/project/$projectId/browse/$filePath` | File View | Holistic file review with file/function-level actions. |
| `/project/$projectId/path/$pathId` | Walkthrough Canvas | xyflow canvas for the path. Search params: `focusNode`, `digStack`, `scope`. |
| `/project/$projectId/synthetic/$synthId` | Walkthrough Canvas (synthetic) | Synthetic walkthrough as a sequenced canvas. |
| `/comparison` | Comparison Setup | Supply base/head refs; confirm. |
| `/comparison/overview` | Comparison Overview | Three-layer summary screen (Risks panel + Path Deltas list + Indirect Impact panel). |
| `/comparison/path/$pathDeltaId` | Path Delta Comparison | Paired xyflow canvases with diff annotations. |
| `/comparison/contract/$contractChangeId` | Contract Change Detail | Modal/side-panel off Risks; standalone route for deep-linking. |
| `/progress` | Progress Dashboard | Coverage / composition / drilldowns. |
| `/rules` | Rule Management | Rule authoring (user + project scope). |
| `/settings` | Settings | LLM toggle, syntax theme, data location, cache controls. |

**Comparison-mode visual design status.** The data contracts are firm (`13-comparison-flows.md`); the screens are sitemap-locked (`/docs/design/spec.md` §5). Detailed visual layouts for Comparison Overview, Path Delta Comparison, and Contract Change Detail are pending — implementation may scaffold these screens with minimally-styled content while visual design iterates against working data. See `/docs/design/spec.md` §5 for the policy.

All nested routes preserve context via TanStack Router's layout routes. Breadcrumbs are derived from the route match tree.

## Feature folders

```
apps/web/src/features/
├── codebase/         # codebase picker, overview, open/switch
├── walkthrough/      # path navigation, node display, dig-into stack
├── comparison/       # comparison-mode surface (Risks, Path Deltas, Indirect Impact)
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
├── blueprint/        # Blueprint Draft visual primitives — see 14-design-system.md
│   ├── chip/
│   ├── corner-tick/
│   ├── drafting-label/
│   ├── panel/
│   ├── title-block/
│   ├── line-gutter/
│   └── path-breadcrumb/
├── ui/               # shadcn-wrapped primitives (Button, Dialog, Tabs, ...)
├── code/             # syntax-highlighted code view, diff view, line anchor
├── review/           # status badges, comment bubble (reusable across features)
└── layout/           # page shell, sidebars, breadcrumb
```

The `blueprint/` tier is canonical — feature components compose Blueprint primitives, not raw HTML. Inventing a new visual pattern at the feature level is a sign that a primitive is missing; add it to `blueprint/` first (with stories) before composing it into a feature.

## Components: conventions

- **Named exports only.**
- **One component per file.**
- **Props use `type`, never `interface`.**
- **Local state via `useState`; cross-component state via hooks that read from the feature store.**
- **No inline `if (isLoading) return <Spinner />` cascades.** Use `Suspense` + skeleton components. Each route component has a matching skeleton.
- **Accessibility**: use shadcn primitives, which are Radix-based. Label every interactive element. Keyboard shortcuts must have a visible hint on hover / in a help overlay.

## Styling

- **Visual language: Blueprint Draft.** See `14-design-system.md` for the full token set, component patterns, and conventions specific to the drafting metaphor.
- Tailwind v4 with the design tokens mapped via `@theme` in `apps/web/src/styles/tokens.css`.
- Colors, spacing, radii, and typography scales come from tokens. **No hex codes in components, no magic numbers in spacing, no font-family declarations outside tokens.**
- **No inline styles** except for truly dynamic values (e.g., a computed grid template).
- Border radius is `0` for everything except indicator dots/pills (`rounded-full`).

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

## Comparison-mode UI patterns

Constraints the visual design of comparison-mode screens must satisfy. The data model (`13-comparison-flows.md`) gives the frontend three orthogonal layers to render; the design spec (`/docs/design/spec.md` §5) defines the screen breakdown. The patterns below are non-negotiable design constraints:

- **Three-layer surface, top-down.** The default comparison view leads with Risks (Layer 1), then Path Deltas (Layer 2), then Indirect Impact + Untouched count (Layer 3). The reviewer sees what propagates before they drill into individual paths.
- **Path-first, diff-overlaid (not the inverse).** There is no separate "Files Changed" tab. When a reviewer enters a path comparison, diff hunks render **inline** at the position of each modified node. The walkthrough narrative is the navigation; diffs are attached to it.
- **Calming count is load-bearing.** The Untouched count is shown prominently on the comparison landing page, with the indirect-impact sub-bucket called out underneath. "127 of 134 paths unchanged — 6 cross a changed contract" must read as a single unit, not as two independent stats.
- **Cosmetic noise is hidden by default.** A toggle (or sub-route) opts the reviewer into the cosmetic bucket. Default views never include cosmetic-only changes.
- **Risk badges on path lists.** When a comparison is active, every path-list row carries a `riskMarker` indicator (see `08-review-state.md`). Distinct from status; orthogonal to it.
- **Affected-caller cross-reference is one click.** From any contract change, the reviewer can pivot to "show me the 4 callers that don't pass this argument explicitly" without leaving the surface.
- **Comparison-mode toggle is global.** Once a comparison is set via `/comparison`, the rest of the app reflects it: walkthrough views show change annotations; status bars show comparison state; closing the comparison is a single explicit action.

Components in `features/comparison/`:

- `RisksList` — top-level Layer 1 surface with grouped contract changes.
- `ContractChangePanel` — per-change detail with affected-caller table.
- `PathDeltaList` — Layer 2 surface with classification grouping.
- `PathComparisonView` — paired walkthrough renderer with inline diff hunks.
- `IndirectImpactList` — Layer 3 surface.
- `ComparisonStatusBar` — persistent indicator showing `(baseRef, headRef)` and a "close comparison" affordance.

## Open items for the design pass

These will be answered when detailed designs land. Flagged here so nobody is surprised:

1. How is the focused canvas node visually distinguished from secondary nodes — scale, corner ticks, focus ring, or all three?
2. Canvas node body density — full code inline by default, or signature + first ~10 lines with click-to-expand? See `/docs/design/spec.md` §8.
3. Dig-into visual persistence — when popping back, does the dug-in child stay visible at low opacity, collapse, or fade out?
4. How do status badges on canvas nodes differ for `reviewed_current` / `reviewed_stale` / `info_requested`?
5. How are path categories displayed in the project overview — tabs, sidebar, collapsible sections?
6. How does the reviewer trigger a file-level cascade? What does the conflict prompt look like?
7. How is LLM-disabled surfaced — persistent banner, chip, or only contextual indicators?
8. What does the prep question composer look like — modal, inline, or side panel?
9. Empty states: first-time codebase open, all paths completed, nothing to review.
10. Comparison-mode Path Delta Comparison: one shared minimap or two side-by-side?
11. How prominently is the risk marker badged on path lists, and how does it interact with existing status badges?
12. How does the reviewer navigate from a contract change to the specific call sites of affected callers?

Each has an implementation implication, but none blocks backend work.
