# Implementation Plan

This is the chunk-by-chunk plan for shipping Code Walkthroughs. Each chunk is one PR / one commit, includes its own tests, and passes all checks in `/docs/engineering/10-testing.md`'s "AI implementation guards" section before being declared done.

## How this doc works

- **Chunks are numbered.** Phases group related chunks for readability; chunk numbers are stable identifiers.
- **Each chunk has a definition of done.** Don't mark a chunk complete unless every line under "Definition of done" is true.
- **Re-order with care.** Chunks have dependencies. Where dependencies are non-obvious they're called out explicitly.
- **Update this doc as work proceeds.** Mark chunks `in progress` and `done`. If a chunk is split, give the children the parent's number with letter suffixes (`5a`, `5b`).
- **Out-of-plan work** that's necessary mid-chunk gets noted in the chunk's commit message but doesn't earn a new chunk number unless it's substantial.

## The "small commitable chunk" rule

Every chunk is a vertical slice that:

- Touches DB → API → UI → tests where applicable.
- Is independently shippable (tests pass, app boots, no half-finished half-of-a-feature).
- Has visible value at the end. "I can now do X in the app" or "the analyzer now produces Y."
- Sizes to ~1–3 days of focused work.

When a chunk would be larger than that, split it into letter-suffixed sub-chunks (e.g., `1A`, `1B`, `1C` for the foundation tier).

---

## Phase A — Foundation

The Blueprint Draft visual language and canvas substrate. No backend changes; everything serves the UI tiers downstream.

### Chunk 1A — Tokens and fonts

**Scope**: Visual primitives at the lowest level.

- `apps/web/src/styles/tokens.css` with `@theme` block and CSS custom properties from `/docs/engineering/14-design-system.md`.
- `@font-face` declarations for Inter and IBM Plex Mono (self-hosted under `apps/web/public/fonts/`).
- Dot-grid background utility (CSS, available as a Tailwind class).
- Base body / typography defaults applied via the global stylesheet.
- A `/styles` route or Storybook story that renders the palette + chip variants + type scale (analog of `style-preview.jsx`) so we can eyeball that tokens look right.

**Definition of done**:
- Tokens load without warnings; Tailwind classes like `bg-surface`, `text-text-primary`, `font-mono`, `tracking-widest` resolve.
- Inter and IBM Plex Mono load locally — no network request to Google Fonts at runtime.
- Style preview renders with all colors, the dot-grid background, the type scale.
- `pnpm typecheck && pnpm lint && pnpm test` clean.

### Chunk 1B — Tier-0 Blueprint primitives

**Scope**: `<DraftingLabel>`, `<Chip>` (all variants from `14-design-system.md`), `<CornerTick>`.

- Storybook installed if not already; one story file per primitive with default + variants + edge cases.
- `chip-variants.ts` keyed enum mapping variant → token colors.
- Component tests via Vitest + `@vitest/browser` for any non-trivial rendering logic (chip variant resolution, label uppercase enforcement).

**Definition of done**:
- All three primitives exist with stories.
- `pnpm storybook` boots and shows the three components rendering correctly across variants.
- Primitives use only tokens (no hex codes, no magic numbers).
- `pnpm typecheck && pnpm lint && pnpm test` clean.

### Chunk 1C — Tier-1 Blueprint surfaces

**Scope**: `<Panel>` (with optional corner ticks), `<TitleBlock>`, `<PathBreadcrumb>`, `<LineGutter>`.

- Stories for each surface, including the composed-with-Tier-0 variants (e.g., a Panel with header containing a DraftingLabel + Chip).
- A "kitchen sink" story that renders the walkthrough-node-shape from the style preview to validate visual fidelity.

**Definition of done**:
- All Tier-1 surfaces exist with stories.
- The kitchen-sink story matches the `style-preview.jsx` walkthrough mockup at the structural level.
- `pnpm typecheck && pnpm lint && pnpm test` clean.

### Chunk 1D — Tier-2 canvas primitives

**Scope**: xyflow + dagre installed and configured. `<CanvasNode>` (all four variants), `<CanvasEdge>` (all five variants), `<CanvasMinimap>`, `<CanvasControls>`, `<PairedCanvas>`.

- xyflow ReactFlowProvider and a `withCanvasContext` Storybook decorator.
- A demo story that renders a fixture path of ~7 nodes with mixed classifications and statuses.
- Layout helper that consumes a path's nodes + edges and emits xyflow-compatible position data via dagre with `rankdir: 'LR'`.
- A Playwright canvas-smoke test (boots Storybook, renders the demo story, screenshots it) since canvas testing in plain Storybook is awkward.

**Definition of done**:
- Canvas renders a fixture path with deterministic horizontal-tree layout.
- All four CanvasNode variants and all five CanvasEdge variants have stories.
- Pan, zoom, fit-to-view, mini-map all work.
- Playwright canvas-smoke test passes.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e` clean.

---

## Phase B — Walkthrough mode core

End-to-end value: open a codebase, walk a path, take review actions.

### Chunk 2 — Codebase picker

**Scope**: The landing page.

- Recent codebases list (already wired in the backend; surface it).
- Directory picker (HTML `<input type="file" webkitdirectory>` or a server-side prompt).
- "Open codebase" mutation flow with project detection display.
- Empty state for first run.

**Definition of done**:
- Reviewer can open a codebase from the UI.
- Recent codebases populate after the first open.
- Playwright test covers the open-and-resume flow.

### Chunk 3 — Analysis progress

**Scope**: Wire `analysis.start` and `analysis.onEvent` subscription into the UI.

- Per-project progress bars with stage indicators.
- Cancel button uses `analysis.cancel`.
- Live event stream via tRPC subscription (SSE).

**Definition of done**:
- Reviewer can watch analysis progress in real time.
- Cancellation works; restarting picks up where it left off.
- Playwright test covers the progress visibility + cancellation.

### Chunk 4 — Project overview + path list

**Scope**: The project home base.

- Path list grouped by entry-point kind (HTTP, CLI, job, etc.) — no LLM categorization yet.
- Synthetic walkthrough placeholders.
- File browser entry.
- Remaining prep questions visible.
- Progress summary widget.

**Definition of done**:
- Reviewer can see all detected paths, ordered deterministically.
- Clicking a path navigates to the walkthrough route (which still 404s — that's chunk 5).
- Playwright test verifies path list display.

### Chunk 5 — Walkthrough canvas, read-only

**Scope**: The full walkthrough surface, no review actions yet.

- `walkthrough.getPath` and `walkthrough.getNode` data flowing into the canvas.
- Focus state on the entry-point node.
- Keyboard navigation (`j`/`k` for focus advance).
- Click-to-focus.
- Preamble panel as collapsible sidebar / off-canvas element.
- Classification chip and four-state status indicator on each node.

**Definition of done**:
- Reviewer can walk a real path, focusing nodes one at a time.
- Path data round-trips through the canvas with correct layout.
- Keyboard shortcuts work.
- Playwright test covers the walk-a-path flow end-to-end.

### Chunk 6 — Review actions

**Scope**: Approve / reject / request info on canvas nodes.

- Action row docked to the focused node or the canvas surface.
- `review.setStatus` mutation with optimistic update.
- Comment-as-justification field; required for `request_info`.
- Status indicator updates on the focused node and persists across reload.
- Four-state machine fully exercised (`never_reviewed` → `reviewed_current`; later, `reviewed_stale` after re-analysis).

**Definition of done**:
- Reviewer can take all three actions on any node.
- Status persists across reload.
- The required-comment validation works.
- Playwright test covers each action and persistence.

---

## Phase C — Walkthrough complete

The reviewer can do real review work end to end.

### Chunk 7 — Dig into + reuse handling

**Scope**: Spatial dig-into navigation per `/docs/design/spec.md` §6.3.

- Clicking a downstream call edge expands the called node into the canvas as a child.
- Reuse prompt (Skip / Re-examine) for previously-reviewed callees.
- Path-scoped approval opt-in at the moment of action.
- `review.promoteScopedApproval` wired up.
- Dig-into focus history persisted in URL search params.

**Definition of done**:
- Reviewer can dig multiple levels deep and pop back without losing state.
- Reuse prompt fires for previously-reviewed functions.
- Path-scoped approvals exist and surface correctly on subsequent path encounters.
- Playwright test covers dig-deep, pop-back, and the reuse prompt.

### Chunk 8 — Free-form comments

**Scope**: Comments at line-range / function / file granularity, independent of status.

- `review.addComment`, `review.updateComment`, `review.deleteComment`, `review.listComments`.
- UI affordances: a comment composer attached to the focused node, a line-range comment via gutter selection, a file-level comment from the file browser.
- Persisting and displaying multiple comments per anchor.
- Orphaned-comment archival (placeholder; full handling in chunk 13).

**Definition of done**:
- Reviewer can attach comments at all three anchor levels.
- Comments accumulate; deleting status doesn't delete comments.
- Playwright test covers each anchor kind.

### Chunk 9 — Prep pass

**Scope**: The prep queue.

- `prep.listQuestions`, `prep.getQuestion`, `prep.answerQuestion`.
- Queue UI with question composer.
- Pre-generated answer chips (LLM-on path) + alternatives.
- Mid-walkthrough prep question injection (encountering an unresolved branch surfaces a prep question inline).
- Answer feedback loop: a `classification` answer updates `cache.db.classifications`; a `path_branch` answer re-materializes the path.

**Definition of done**:
- Reviewer can triage prep questions from a dedicated queue page.
- Prep questions encountered mid-walkthrough flow back to the queue.
- Answers propagate into downstream analysis.
- Playwright test covers each prep-question kind.

### Chunk 10 — File browser + file view

**Scope**: The fallback / free-browsing surface.

- `walkthrough.listProjects` extended to include file tree + classifications.
- File view: full file with syntax highlighting + per-function status indicators.
- File-level cascade with conflict prompt (`review.setFileStatus`).
- All status actions are global at file scope.

**Definition of done**:
- Reviewer can browse all files in a project.
- File-level cascade works including the conflict prompt's three options.
- Playwright test covers cascade-with-no-conflicts and cascade-with-conflicts (each resolution mode).

---

## Phase D — Analysis quality

Make the paths and classifications smarter. Mostly server-side.

### Chunk 11 — LLM Stage 0/1/2 classification

**Scope**: Implement the full layered classifier.

- Stage 0 architectural summary pipeline.
- Stage 1 deterministic signals expanded.
- Stage 2 LLM augmentation pipeline.
- Reconciliation logic.
- Classification confidence + source visible in the UI.
- Degradation tested end-to-end (LLM-off path matches LLM-on path's deterministic output).

**Definition of done**:
- Stage-by-stage classifications produce expected output on fixture codebases.
- Degradation contract holds (per `06-llm-integration.md`).
- UI surfaces classification source + confidence.
- Vitest degradation tests pass for each stage.

### Chunk 12 — Path categorization (LLM)

**Scope**: Thematic grouping in the path list.

- LLM pipeline for path categorization.
- Categories displayed in project overview path list.
- Reviewer can reorder; deterministic fallback when LLM disabled.

**Definition of done**:
- Categories appear in the path list when LLM is on.
- Path list falls back to deterministic ordering when LLM is off.
- Reviewer can override category order.

### Chunk 13 — Re-analysis + staleness

**Scope**: File-change detection drives the four-state machine.

- File-change detection via content hash diff against `cache.db.files`.
- Body-change detection on functions; staleness transition.
- "Previously [status] — modified since" indicator on canvas nodes.
- Diff view (previously-reviewed vs current) accessible from the staleness indicator.
- Orphaned comments archived.

**Definition of done**:
- Editing a function flips its status to `reviewed_stale` after re-analysis.
- Diff view renders the change.
- Orphaned comments surface in an archive list.
- Playwright test covers edit-and-reanalyze.

### Chunk 14 — Function rename detection

**Scope**: Carry approval forward across renames.

- Similarity heuristic (AST shape + token overlap + signature match).
- Surfacing in prep pass and in-walkthrough prompt.
- Confirmation migrates `review_status` and comments to the new identity.

**Definition of done**:
- Renaming a function above the threshold surfaces a rename candidate.
- Confirming carries state forward; rejecting treats the new function as new.
- Vitest + Playwright tests cover both confirm and reject paths.

---

## Phase E — Rules and progress

### Chunk 15 — Built-in pattern rules

**Scope**: Rule evaluation engine + ship the default rule set per classification.

- Rule evaluation pipeline (sync, no LLM in v1 for built-ins).
- Default checklist per classification (route_handler, service, etc.) per `9.1` of the product spec.
- Pass / fail / skip rendering on canvas nodes.
- `unchecked` state distinct from skip.

**Definition of done**:
- Built-in rules fire on relevant nodes.
- Rule status renders in the focused node's checklist panel.
- Vitest covers each shipped rule.

### Chunk 16 — Shell + LLM rule tiers

**Scope**: Author-extensible rules.

- Shell rule executor with structured stdin/stdout.
- LLM rule executor with prompt template + structured response.
- Rule authoring UI (`/rules`).
- Rule scoping (user vs project).
- Origin badges per rule.

**Definition of done**:
- Reviewer can author all three tiers.
- Rule origin is visible in the UI.
- Shell rule errors don't crash the analyzer.
- Playwright test covers authoring, evaluating, and origin display.

### Chunk 17 — Progress dashboard

**Scope**: Coverage + composition + drilldowns.

- `progress.*` endpoints fully wired.
- Codebase / project / path / file scoping.
- Path coverage and full coverage flavors.
- Reset controls.

**Definition of done**:
- Reviewer can see progress at all scopes.
- Reset works at each scope.
- Playwright test covers reading + resetting at multiple scopes.

---

## Phase F — Comparison mode

The big new chunk — comparison mode with the three-layer surface.

### Chunk 18 — Comparison data layer

**Scope**: Everything in `13-comparison-flows.md` except the visual surface.

- `NodeSignature` extraction during parse.
- Two-ref analysis orchestration.
- Stage 3 (Delta and Risk) implementation.
- Persistence to `comparisons/<base>..<head>/{base.db, head.db, delta.db}`.
- All `comparison.*` tRPC procedures.
- Full test matrix from `13-comparison-flows.md`'s "Testing expectations" section.

**Definition of done**:
- Setting a comparison via `analysis.setComparison` produces correct `ContractChange`, `AffectedCaller`, `PathDelta`, `PathDeltaPosition`, `IndirectImpactPath` records on a fixture base/head pair.
- All `comparison.*` queries return correct data.
- Comparison-mode persistence is isolated per `(base, head)` pair.
- Vitest covers each test case in the test matrix.
- No UI yet — verification is via the tRPC test caller.

### Chunk 19 — Comparison UI scaffold

**Scope**: Minimally-styled UI on `/comparison/*` routes wired to the data layer.

- Comparison Setup form.
- Comparison Overview page with three layers as raw lists/panels.
- Path Delta Comparison route renders a `<PairedCanvas>` with real data.
- Contract Change Detail as a modal / side panel.
- Risk markers visible on path-list rows.

**Definition of done**:
- Reviewer can set a comparison, see Risks, drill into a Contract Change, see Path Delta Comparison on the canvas, see Indirect Impact.
- The data is correct; the visual treatment is provisional.
- Playwright test covers the full comparison flow end-to-end.

### Chunk 20 — Comparison detailed visual design (deferred)

**Scope**: Replace the scaffolded UI with the designed surfaces once visual design is delivered.

- Pure UI rework. Backend untouched.
- Each new layout lands with story coverage.

**Definition of done**:
- All comparison-mode screens match the delivered designs.
- All Playwright tests still pass.

---

## Per-chunk verification protocol

Before declaring any chunk done, run:

1. `pnpm typecheck` — must pass on every package.
2. `pnpm lint` — clean. No new `// biome-ignore` without a one-line justification.
3. `pnpm test` — full Vitest workspace passes.
4. `pnpm test:e2e -- <pattern>` for any UI-touching chunk.
5. For UI chunks: `pnpm dev`, exercise the golden path *and* one edge case (empty / error / LLM-disabled). State explicitly in the commit message which scenarios were verified.
6. New tests exist that would fail if the chunk's behavior were removed.
7. No new TODOs / `@ts-expect-error` / `// FIXME` without an issue reference.
8. Relevant docs updated in the same commit if behavior changed.

If any line above is not true, the chunk is in progress, not done.

## Commit hygiene

- One chunk per commit.
- Commit messages follow the existing style: imperative subject, optional body explaining the *why*, Co-Authored-By footer.
- No `--no-verify`, no `--amend` of pushed commits.
- Tests land with the code they exercise — never in a follow-up.

## Out-of-band work

Things that aren't in this plan but might come up:

- **Bugfixes** discovered while implementing a chunk: fix in the chunk if they're caused by the chunk's changes; otherwise open a separate commit/PR.
- **Refactors** that reveal themselves: do the refactor first as its own commit if it makes the chunk cleaner; otherwise note as a follow-up and ship the chunk.
- **Doc drift** from implementation reality: updates land in the chunk's commit per the engineering README.
