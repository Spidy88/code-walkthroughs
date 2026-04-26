# Code Walkthroughs — Design Specification

## 1. Purpose and Scope

This document is the canonical source of truth for **what the product looks and feels like, and how a reviewer moves through it**. It sits between the product specification (`/code-walkthrough-tool-spec.md`, which defines *what we're building*) and the engineering documentation (`/docs/engineering/`, which defines *how we build it*).

This doc covers:
- Audience, register, and product tone
- Visual direction (Blueprint Draft) and where its details live
- The **surface model** — the architectural decision to render walkthroughs on an infinite canvas
- The sitemap (decided)
- Per-flow user journeys (decided)
- Open visual-design questions and the policy for resolving them

This doc does *not* cover:
- Token values, primitive components, or accessibility specifics — see `/docs/engineering/14-design-system.md`
- Per-page pixel-level layouts — those are produced as designs land
- Implementation details — see the `/docs/engineering/` set
- Product decisions about *what* the tool does — see `/code-walkthrough-tool-spec.md`

The artifacts in `/docs/design/raw/` are **draft outputs** that informed this spec. They are not normative. When this spec and `raw/` disagree, this spec wins.

## 2. Audience and Register

### Personas

The design serves three personas, in order of frequency:

- **The PR Reviewer** — knows the codebase, reviewing a delta. Wants behavior-ordered review, not file-ordered.
- **The AI-Code Auditor** — same person as the PR Reviewer in many orgs, but with higher suspicion. Wants a forensic trail.
- **The New Joiner** — unfamiliar codebase, wants confidence they've seen the load-bearing parts.

All three are engineers comfortable reading code, impatient with tooling that gets in the way.

### Register: minimal, technical, drafting-inflected

The interface borrows the visual vocabulary of engineering drawings — figure callouts, leader lines, hairline rules, revision stamps. Not skeumorphic; we use the *language*, not the texture. The substrate of this tool *is* a graph (call graph, AST), so a drafting-style interface is conceptual fit, not decoration.

Information density is high. Color is reserved for semantic signal — approve / reject / info / new / modified / stale / contract-change / indirect-impact. Decoration is grayscale.

Motion is short (80–220ms), semantic (only for state changes), never decorative.

## 3. Visual Direction: Blueprint Draft

The full specification of tokens, primitive components, and accessibility rules lives in `/docs/engineering/14-design-system.md`. This doc records the direction-level decisions:

- **Blueprint Draft** is the confirmed visual direction.
- Tokens from `/docs/design/raw/style.json` are confirmed as the **starting palette**. They may evolve as designs land for new surfaces (especially the comparison-mode three-layer surface and the canvas).
- The drafting metaphor extends to the canvas: nodes are panels with corner ticks; edges are leader-line-style; edge labels carry call-site annotations.
- Color use is load-bearing only. New colors require a semantic justification.
- Sharp corners (0px radius) everywhere except indicator dots and pills.

## 4. The Surface Model

### 4.1 Walkthroughs are an infinite canvas, not a list

The primary review surface — the walkthrough — is rendered on an **infinite canvas** as a horizontal tree of nodes. Each node in the call path is a visual card; edges represent calls. The reviewer pans, zooms, and focuses individual nodes for review.

This is not a stylistic choice. It is the surface that fits the data:

- **The data is a graph.** A call path is literally a tree (with cycles handled). A list view flattens information that the canvas preserves.
- **Forks, cycles, and parallel paths become visible.** A path that branches at a `switch` or polymorphic call is one diagram showing both branches. A reviewer doesn't have to remember "I came down branch A and have to back out for branch B" — both branches are present.
- **Dig-into navigation becomes spatial.** When the reviewer follows a downstream call, the called node *expands into the canvas* as a child of the caller. Returning is a focus shift, not a stack pop. The reviewer's mental model of "where am I" is the visual graph itself.
- **Comparison mode becomes legible.** Restructured paths are obvious because the graph shape changes between base and head. Risk markers and contract changes appear as annotations on specific nodes/edges.
- **The drafting metaphor reaches its full expression.** A reviewer is genuinely operating a drafting drawing.

### 4.2 Canvas mechanics

- **Library**: [`@xyflow/react`](https://reactflow.dev/) (formerly React Flow). MIT-licensed, React 19-compatible, mature.
- **Layout**: deterministic horizontal tree (left-to-right). Library: [`dagre`](https://github.com/dagrejs/dagre) for v1 (simpler), with [`elkjs`](https://github.com/kieler/elkjs) as an upgrade path if dagre's layouts feel cramped on dense graphs.
- **Pan, zoom, fit-to-view**: standard xyflow controls. Mini-map for orientation on large paths.
- **Focus**: one node has visual emphasis at any given time (corner ticks visible, slight scale, focus ring). Other path nodes are present but secondary. Off-path nodes (preamble, dispatchers) appear collapsed/de-emphasized.
- **Keyboard navigation**: `j`/`k` advance focus along the path; `h`/`l` for fork branches; `enter` to dig into a downstream call (expands a child node); `escape` to return focus to the parent. Shortcuts are placeholders; final mappings finalize during implementation.
- **Deep-linkable**: focused node ID and (where relevant) dig-into focus history are URL search params, so a walkthrough position survives reload and is shareable.
- **Performance**: paths typically have 5–30 nodes; well within xyflow's capabilities. Node bodies render lazily — a card shows signature + chips + summary by default; clicking expands to full code.

### 4.3 What lives on the canvas vs. elsewhere

Canvas surfaces (xyflow):

- **Walkthrough** (single path, walkthrough mode)
- **Path Delta Comparison** (paired graphs, comparison mode — base canvas + head canvas, edges showing matched nodes between them)
- **Synthetic Walkthrough** (curated non-path code as a sequenced canvas)

Non-canvas surfaces:

- **Codebase Picker, Settings, Comparison Setup** — forms / lists.
- **Project Overview** — list of paths grouped by category, plus entry-point summaries. Could include a small "system map" graph as a secondary visual, but the primary content is selectable list items.
- **Prep Pass** — queue of questions; one-at-a-time composer.
- **File Browser, File View** — tree + scroll.
- **Comparison Overview, Risks, Indirect Impact** — list/summary surfaces.
- **Progress Dashboard** — summary metrics.
- **Rule Management** — list + editor.

Rule of thumb: if the data has *structure that matters spatially*, it goes on the canvas. If the data is enumerable or scalar, it doesn't.

### 4.4 Canvas in comparison mode

Per-PathDelta comparison renders **two canvases side by side**: the base path on the left, the head path on the right, with optional faint edges connecting matched node positions between them. Position-level changes (`added` / `removed` / `replaced` / `body_changed` / `unchanged`) are annotations on the head-canvas nodes.

For `restructured` path classifications, the visual shape difference is the primary signal — the reviewer sees that the graph changed shape, not just that a body diffed. For `modified_in_place`, the canvases look identical except for body-changed annotations on specific nodes.

`net_new` and `net_gone` paths render only one canvas, with the missing side either blank or showing "no equivalent at base/head."

## 5. Sitemap (decided)

Each screen lists its purpose, surface type, and routing in `/docs/engineering/12-frontend.md`. Names are normative.

| Screen | Surface | Purpose |
|---|---|---|
| **Codebase Picker** | List + form | Pick a directory to ingest, or resume a recent codebase. Entry point. |
| **Analysis Progress** | Progress UI | Per-project analysis progress while waiting; prep pass available in parallel. |
| **Prep Pass** | Queue | Triage unresolved questions one at a time. |
| **Project Overview** | List + categories | Path categories, synthetic walkthroughs, file browser entry, prep status, progress summary. |
| **Walkthrough Canvas** | xyflow canvas | Primary review surface — the call path as a horizontal tree, focused node review-able with classification, checklist, status, comments. |
| **File Browser** | Tree | Project-tree navigation with per-file classification + status. |
| **File View** | Scroll | Holistic file review with file-level + function-level actions, cascade conflict resolution. |
| **Comparison Setup** | Form | Supply base/head refs; confirm. |
| **Comparison Overview** | Summary panels | Three-layer comparison summary in a single screen: Risks panel (Layer 1), Path Deltas list (Layer 2), Indirect Impact panel (Layer 3). Each panel is expandable to its detail surface. |
| **Path Delta Comparison** | Paired xyflow canvases | Per-path deep-dive: base canvas + head canvas + matched-position edges + position-level diff annotations. |
| **Contract Change Detail** | Panel/modal off Risks | Single contract change with full caller cross-reference and base/head signature diff. |
| **Progress Dashboard** | Summary metrics | Coverage + composition + scoped drilldowns. In comparison mode, surfaces three-layer counts alongside path/full coverage. |
| **Rule Management** | List + editor | Author / scope / enable rules at user and project level. |
| **Settings** | Form | LLM toggle, cost cap, syntax-highlight theme, data location, cache controls. |

### Decisions baked into this sitemap

These were the open calls from the alignment audit; my recommendations stand:

- **Comparison-mode layout**: a single Comparison Overview with the three layers as expandable panels, plus a separate **Path Delta Comparison** screen for the per-path deep dive. Risks and Indirect Impact stay as panels of the overview unless the data outgrows that container — at which point we promote them to their own screens. Rationale: the per-path view is genuinely a different *type* of surface (canvas) and deserves its own route; the summary layers are list-shaped and live well together.
- **Contract Change Detail**: side-panel/modal off the Risks panel. Rationale: it's a deep-dive on a single record, not a navigation destination. Modal keeps the reviewer's place in the comparison overview.
- **Risk markers as a feature**: subsumed under comparison mode in the features list, but visually first-class — risk markers appear as chip annotations on path-list rows, on the walkthrough canvas, and on path delta classifications.

### Comparison-mode visual design

The comparison-mode screens (Comparison Overview, Risks panel, Indirect Impact panel, Path Delta Comparison, Contract Change Detail) are **specified at the data and structural level**, but their detailed visual design is still pending. Implementation may scaffold them with raw / minimally-styled content while the visual design is produced. The Blueprint Draft direction and primitive components apply; the layouts have not been laid out.

This is acceptable because:

- The data contracts are firm (see `/docs/engineering/13-comparison-flows.md`).
- The screens are sitemap-locked (above).
- The Path Delta Comparison's canvas treatment is specified (§4.4 above).
- The remaining work is layout-level visual design, which can be iterated against working data.

## 6. Flow Inventory

Five user flows. The first four are unchanged from the raw drafts; the comparison flow is replaced because the raw version predates the three-layer revision.

Flows are user-journey descriptions, **not screen-by-screen scripts**. Specific button placements, exact navigation order, and screen-internal interactions are implementation decisions made against this spec and the design system.

### 6.1 Ingest and Prep a New Codebase

Persona: New Joiner. Trigger: tool opened with no codebase loaded.

1. Reviewer points the tool at a local directory.
2. Tool detects projects, languages, frameworks; initializes per-codebase state; begins analysis. Unsupported-language projects appear as not-walkable but don't block.
3. While analysis runs, reviewer optionally enters the prep pass. Questions stream into the queue as they're discovered (ambiguous classifications, unresolved branches, entry-point confirmations, optional intent capture).
4. Reviewer triages prep questions: confirm pre-generated answer, pick alternative, or compose custom. With LLM disabled, no pre-generated answer; reviewer composes.
5. Reviewer enters the project overview. Detected paths visible (categorized if LLM enabled), synthetic walkthroughs alongside, file browser available, remaining prep visible.

Reference: `/docs/design/raw/flows/ingest_and_prep.json` (aligned, retained).

### 6.2 Guided Path Walkthrough

Persona: PR Reviewer. Trigger: reviewer picks a path from the project overview.

1. Reviewer scans path categories and picks a path.
2. **The walkthrough canvas opens** (§4 above). Entry point is the focused node; the rest of the path is visible as horizontally-laid-out children.
3. Reviewer reads the focused node — code, classification chip, checklist with rule evaluations, four-state status indicator, optional preamble panel.
4. Reviewer optionally leaves comments (line-range, function, file). Optionally digs into a downstream call — the called node expands into the canvas as a child; reviewer can pan/zoom or use keyboard nav.
5. Reviewer takes a status action (approve / reject / request info), with optional accompanying comment. Optionally narrows to path-scoped at the moment of action.
6. Reviewer advances focus to the next node along the path (keyboard or click). At a fork, the canvas shows multiple outgoing edges; reviewer picks a branch.
7. At terminus (external call, DB write, returned response), reviewer marks the path complete or pops back to the path list.

Reference: `/docs/design/raw/flows/guided_path_walkthrough.json` (aligned conceptually; the canvas surface replaces the implied "screen advances per node" step).

### 6.3 Dig Into a Called Function

Persona: PR Reviewer. Trigger: reviewer activates a downstream call's dig-into affordance during a walkthrough.

1. Reviewer focuses on a downstream call edge from the current node.
2. If the called function has prior status, a reuse prompt surfaces: Skip (default) / Re-examine. If never reviewed, dig-in proceeds without a prompt.
3. **On the canvas, the called node animates in as a child** of the current node. Focus shifts to the new node. The original caller stays visible (its node remains on the canvas, slightly de-emphasized).
4. Reviewer reviews the new node, optionally digs further (more children appear), optionally takes a status action with global or path-scoped scope.
5. To return, reviewer presses back / pop. Focus shifts to the parent. The dug-in node may stay visible (collapsed) or fade out per UX preference; the canvas state persists so a re-entry is instant.

Reference: `/docs/design/raw/flows/dig_into_navigation.json` (aligned conceptually; the navigation stack becomes spatial focus history on the canvas).

### 6.4 File Browser Review

Persona: New Joiner. Trigger: reviewer chooses to browse files directly.

1. Reviewer enters the file browser; sees the project tree with per-file classification + status badges.
2. Reviewer opens a file. File view shows full file with syntax highlighting, file-level classification, per-function status, file-level rule evaluations.
3. Reviewer reviews the file holistically. Takes file-level or function-level status actions; leaves comments at line / function / file granularity. File-level actions cascade with conflict resolution (Preserve / Override / Cancel).
4. Reviewer navigates to next file or returns to project overview. Synthetic walkthroughs available as a guided alternative for non-path code groups.

Reference: `/docs/design/raw/flows/file_browser_review.json` (aligned, retained).

### 6.5 New-Code Comparison Review (replacement)

Persona: AI-Code Auditor / PR Reviewer. Trigger: reviewer opens a codebase and chooses comparison mode, or supplies refs at ingestion time.

1. Reviewer supplies two commit refs: base and head. Tool validates refs.
2. Tool runs full analysis at each ref into separate caches, then runs the Delta and Risk stage producing the three-layer comparison surface.
3. Reviewer enters the **Comparison Overview**. Sees three layers in a single screen:
   - **Risks panel (Layer 1)**: contract changes with affected callers nested. Default-removed-on-validateRequest with 4-of-7 callers not passing the argument is the canonical case.
   - **Path Deltas list (Layer 2)**: paths grouped by classification (`net_new`, `net_gone`, `restructured`, `modified_in_place`, `unchanged`). The "calming count" — `127 of 134 paths unchanged` — is prominent.
   - **Indirect Impact panel (Layer 3)**: untouched paths that cross a contract change. Surfaced as a sub-bucket of unchanged.
4. Reviewer drills into specific items as their attention is drawn:
   - Click a contract change → Contract Change Detail (modal off Risks): full caller cross-reference, base/head signature diff inline. Pivot to specific call sites.
   - Click an affected path → **Path Delta Comparison** (paired canvases). Walk the base path and head path with diff annotations on positions.
5. On the path comparison canvas, reviewer takes status actions on changed nodes. Risk-marked but unchanged paths still receive a marker badge in the path list; reviewer chooses whether to take action.
6. Reviewer checks the **Progress Dashboard**. In comparison mode, the dashboard surfaces three-layer counts: contract changes outstanding, affected paths reviewed, indirect-impact paths acknowledged, alongside path / full coverage.

Success state: every contract change has been seen, every changed path has a current status, every indirect-impact path has been acknowledged or actioned, and the reviewer can defend completeness from the dashboard.

Error states:
- Invalid ref → clear error at ref entry, suggest checking with `git`.
- Refs identical → "no changes between these refs," drop into walkthrough mode.
- Not a git repo → comparison mode unavailable; explain why.
- Rebased branch invalidates refs → prompt for new refs; review state survives because it's keyed to node identity.
- Very large change range → stream comparison data into the overview as it materializes; do not block on full materialization.

Replaces: `/docs/design/raw/flows/new_code_comparison_review.json` (stale).

## 7. Component Vocabulary

The implementation-level component set lives in `/docs/engineering/14-design-system.md`. The vocabulary in summary:

**Tier-0 primitives**: `<DraftingLabel>`, `<Chip>`, `<CornerTick>`.

**Tier-1 surfaces**: `<Panel>`, `<TitleBlock>`, `<PathBreadcrumb>`, `<LineGutter>`.

**Tier-2 canvas-specialized** (added by the canvas decision):

- **`<CanvasNode>`** — the xyflow custom node type wrapping a `<Panel>`. Variants: `code` (full code panel with classification, body, dig-into footer), `summary` (collapsed: signature + chips), `preamble` (de-emphasized; non-walkthrough context), `dispatcher` (router/switch nodes). Focus state is a prop.
- **`<CanvasEdge>`** — xyflow custom edge with leader-line styling. Variants: `resolved` (solid, primary), `unresolved` (dashed, tertiary), `handler-attached` (dotted, primary), `comparison-matched` (faint, between paired canvases in comparison mode), `dig-into-active` (highlighted on the focused chain).
- **`<CanvasMinimap>`** — orientation aid. Configured to show node classification colors at a glance.
- **`<CanvasControls>`** — pan / zoom / fit / reset.

These compose with the existing primitives. A canvas node is a panel; an edge label is a drafting label; a status badge on a node is a chip. The canvas is the medium, not a separate aesthetic.

## 8. Open Questions

Items that need decisions during or after implementation:

1. **Canvas node body density** — does the focused node show full code inline, or expand to full code only when explicitly opened? Default lean: signature + first ~10 lines visible; full body on click. Validate during implementation.
2. **Dig-into visual persistence** — when the reviewer pops back from a dug-in node, does the child node fade out, collapse, or stay visible at low opacity? Current default: stay visible at reduced opacity so the dig-into history is readable.
3. **Comparison-mode minimap** — does the paired canvas have one minimap or two? Probably one shared minimap that shows both halves side by side. Validate visually.
4. **Storybook coverage of canvas surfaces** — xyflow stories are awkward (the component requires layout context). Worth investing in a `CanvasStorybook` wrapper or relying on Playwright for canvas verification.
5. **Three-layer comparison visual design** — when does this happen? Recommendation: after walkthrough mode is in production and we have real comparison data to design against. Until then, scaffold with minimal styling.
6. **Frontend route for "current codebase" when no project is selected** — auto-redirect to single project, or show codebase summary? Currently ambiguous in the sitemap; needs a small call during implementation.

## 9. Cross-References

- **Product spec**: `/code-walkthrough-tool-spec.md` — what the product does. Authoritative on behavior and scope.
- **Engineering docs**: `/docs/engineering/` — how we build it.
  - `01-architecture.md` — system shape.
  - `12-frontend.md` — frontend tech, state ownership, routing.
  - `13-comparison-flows.md` — comparison-mode contract.
  - `14-design-system.md` — tokens, primitives, accessibility.
- **Raw design artifacts**: `/docs/design/raw/` — draft outputs that informed this spec. Reference, not source-of-truth.

When this spec, the product spec, and the engineering docs disagree:

- Product behavior questions: product spec wins.
- Implementation mechanics: engineering docs win.
- Visual / surface / flow questions: this design spec wins.

A change to one that affects the others must update all in the same PR.
