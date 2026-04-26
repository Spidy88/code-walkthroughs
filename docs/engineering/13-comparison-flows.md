# 13 — Comparison Flows

## Scope

How the tool serves **review-as-it-changed**: PR review and AI-generated-code review. The data structures, analysis stages, and review surfaces specific to comparing two commits of the same codebase. This doc owns the comparison contract end-to-end; other docs reference it.

## Out of scope

Single-commit walkthrough mechanics (see `05-analysis-pipeline.md`, `07-api-surface.md`). Re-analysis of a single working tree as files change locally (see `09-reanalysis.md` — change handling, not commit comparison).

## Two jobs, one primitive

The tool serves two fundamentally different jobs that share the **path** as their primitive:

| Job | What the user is doing | What the tool must produce |
|---|---|---|
| **Walkthrough mode** | Understanding a codebase as it is | Paths through the system, classified, navigable, with context |
| **Comparison mode** | Interrogating a change between two commits | What changed, what it propagates to, what's at risk, navigable in the same path-shaped frame |

Walkthrough mode **explains a system**. Comparison mode **interrogates a change**. They share path detection, classification, and the review surface — but their output, their failure modes, and the questions a reviewer brings to them are different. The doc set treats them as such.

## Guiding principle: identification, not judgment

The system **identifies and navigates**; the reviewer **evaluates**.

This means:

- We compute structural facts: signature diffs, body diffs, call-graph deltas, path membership.
- We surface them in a navigable, categorized form so the reviewer's attention lands on what's load-bearing.
- We **never** say "this is broken," "this is unsafe," or "this needs fixing." We say "this changed; here's what reaches it; here are the affected callers."
- The LLM is **not load-bearing for correctness** in this flow. Structural detection is the source of truth. LLM output (delta narratives, prep questions) polishes the experience but its absence does not produce false negatives in the risk surface.

Code walkthroughs surface structure; comparison flows surface deltas. Neither gates merges, blocks reviews, or assigns severity. The reviewer brings judgment; the tool brings precision.

## The three layers

A comparison view has exactly three layers, in this order. Each addresses a different failure mode that a file-diff-only review (like GitHub's) cannot.

### Layer 1 — Risks (cross-cutting)

**What it is**: contract-shaped facts that propagate to callers and importers regardless of which path traverses them.

**What it catches**: removed default values, added required parameters, narrowed types, removed exports, changed return types, changed exported-ness. The "I changed `validateRequest`'s signature and forgot to update three of the seven callers" problem.

**Detected from**: structural diff of `NodeSignature` records between the base and head analysis runs. The call graph (also from the analysis runs) enumerates affected callers.

**Surfaced as**: a top-level `comparison.listRisks` payload — one record per `ContractChange`, with affected callers enumerated and cross-referenced to whether each caller is on a changed path, an unchanged path, or no walked path.

### Layer 2 — Path deltas

**What it is**: a per-path comparison between the base and head analysis runs.

**What it catches**: how each path's *shape* and *content* changed.

**Path-pair classifications**:
- **`net_new`** — entry point exists at head but not at base. Treated as a fresh walkthrough.
- **`net_gone`** — entry point exists at base but not at head. Surfaced for review with the base path content; no head equivalent.
- **`restructured`** — same entry point, but the route through the call graph changed shape (different nodes, different ordering, fork added/removed).
- **`modified_in_place`** — same entry point, same node identities in the same order, but at least one node's body changed.
- **`unchanged`** — both runs produce identical paths. The "calming count" surface; no review needed unless flagged by Layer 3.

**Per-position annotations** within a path-pair (for `restructured` and `modified_in_place`): each position carries a `change_kind`:
- `unchanged` — node identical at both refs.
- `body_changed` — same node identity, body differs.
- `added` — node appears at head only.
- `removed` — node appears at base only.
- `replaced` — node at this position differs in identity from base to head.

**Surfaced as**: `comparison.listPathDeltas` (summary per path-pair) and `comparison.getPathComparison(pathId)` (paired walkthroughs with diff hunks rendered inline at modified positions).

### Layer 3 — Indirect impact

**What it is**: paths that are `unchanged` at the path-delta level but cross a node whose contract changed.

**What it catches**: previously-approved paths that now traverse a stricter contract. The "this PR's auth changes silently apply to billing routes" problem.

**Detected from**: for each `ContractChange` in Layer 1, query `path_nodes` membership at head for the changed node. Any path whose membership includes that node and whose path-delta classification is `unchanged` is added to indirect impact. Paths classified `modified_in_place` or higher are already surfaced in Layer 2.

**Surfaced as**: `comparison.listIndirectImpact` and as a sub-bucket within the "Untouched paths" UI region — `127 of 134 unchanged, but 6 cross a changed contract`.

## Change-type categorization

Every change to a node body is categorized so reviewers can spend attention proportionally. Categorization is **deterministic** (AST-level), not LLM-driven, because attention allocation cannot depend on a fuzzy classifier.

| Category | Definition | Surfaced where |
|---|---|---|
| **Structural** | Signature changed (params, defaults, return type) or exported-ness changed. | Layer 1 (Risks). Always surfaces, regardless of whether the node is on a walked path. |
| **Behavioral** | Body AST changed in a way that affects executable structure (control flow, calls, returns). | Layer 2 (Path delta) at the position the node appears on each affected path. |
| **Cosmetic** | Body diff is whitespace, comments, or only adds/removes `console.*` / logger calls / debugger statements. AST shape of executable code is unchanged. | Filtered into a "low-signal" bucket, hidden by default. Not counted in path-delta classification. |

The cosmetic detection is heuristic. False positives (a real change classified as cosmetic) are the worse failure mode, so the heuristic errs conservative: any AST shape difference outside of the allowlist falls back to behavioral.

## Data contracts

Comparison-mode types live in `packages/shared/src/comparison.ts`.

```ts
export type NodeSignature = {
  readonly nodeIdentity: NodeIdentity;
  readonly params: readonly NodeSignatureParam[];
  readonly returnType: string | null;            // null when un-annotated
  readonly exported: boolean;
  readonly bodyHash: string;                      // normalized AST hash of body
  readonly bodyKind: 'structural' | 'behavioral' | 'cosmetic' | 'unchanged';
  // bodyKind is computed during comparison; persisted for cache reuse
};

export type NodeSignatureParam = {
  readonly name: string;
  readonly typeText: string | null;               // null when un-annotated
  readonly hasDefault: boolean;
  readonly defaultText: string | null;            // text only, not evaluated
  readonly optional: boolean;
  readonly rest: boolean;
};

export type ContractChange = {
  readonly id: string;                            // ULID, stable across re-runs of the same comparison
  readonly nodeIdentity: NodeIdentity;
  readonly kind:
    | 'param_added_required'
    | 'param_added_optional'
    | 'param_removed'
    | 'param_default_added'
    | 'param_default_removed'
    | 'param_type_narrowed'
    | 'param_type_widened'
    | 'param_renamed'
    | 'return_type_changed'
    | 'export_added'
    | 'export_removed';
  readonly base: NodeSignature | null;            // null on export_added
  readonly head: NodeSignature | null;            // null on export_removed
  readonly summary: string | null;                // optional LLM-generated; null otherwise
};

export type AffectedCaller = {
  readonly contractChangeId: string;
  readonly callerNodeIdentity: NodeIdentity;
  readonly callSite: { readonly line: number; readonly column: number };
  readonly callerOnChangedPath: boolean;          // true if caller is on a path with delta != unchanged
  readonly callerOnAnyWalkedPath: boolean;        // false → caller is e.g. middleware/helper not in any path
  readonly callPassesArgument: boolean | null;    // for param_default_removed: did the caller pass it?
};

export type PathDelta = {
  readonly basePathId: string | null;             // null when net_new
  readonly headPathId: string | null;             // null when net_gone
  readonly classification:
    | 'net_new'
    | 'net_gone'
    | 'restructured'
    | 'modified_in_place'
    | 'unchanged';
  readonly entryPointKey: string;                 // stable across runs: framework+kind+route
  readonly summary: string | null;                // optional LLM-generated delta narrative
};

export type PathDeltaPosition = {
  readonly pathDeltaId: string;
  readonly basePosition: number | null;
  readonly headPosition: number | null;
  readonly baseNodeIdentity: NodeIdentity | null;
  readonly headNodeIdentity: NodeIdentity | null;
  readonly changeKind:
    | 'unchanged'
    | 'body_changed'
    | 'added'
    | 'removed'
    | 'replaced';
};

export type IndirectImpactPath = {
  readonly pathId: string;                        // head-side path
  readonly contractChangeIds: readonly string[];  // contracts this path now traverses
};
```

`NodeIdentity` is the same `<project>:<file-path>:<symbol-path>` shape used throughout the system (see `04-persistence.md`).

## Comparison runs

A comparison is parameterized by `(baseRef, headRef)` and produces the four result sets above. Both refs are **commit refs** validated against the codebase's git directory. The working tree is not read in comparison mode — `git show <ref>:<path>` is the file source for both runs.

### Stages

```
0. validate refs
1. analyze base   (full single-commit analysis at baseRef, persisted)
2. analyze head   (full single-commit analysis at headRef, persisted)
3. delta + risk   (the new stage that produces Layers 1, 2, 3)
4. categorize     (optional LLM polish: delta summaries, prep questions)
```

Stages 1 and 2 reuse the standard pipeline (`05-analysis-pipeline.md`). The only addition is that each run also extracts `NodeSignature` records during parsing (see "Signature extraction" below). Because LLM results are content-hash cached, files identical between base and head incur near-zero LLM cost on the second run.

Stage 3 is described in detail below. Stage 4 is optional and degrades to omission with no false positives.

### Where the runs live

Two analyses cannot share `cache.db` writes — they would clobber each other. Comparison mode uses **two side-by-side cache databases** keyed by ref:

```
~/.code-walkthrough/codebases/<hash>/
├── state.db
├── cache.db                        # working-tree analysis (default, walkthrough mode)
└── comparisons/<base>..<head>/
    ├── base.db                     # cache.db schema, populated at baseRef
    ├── head.db                     # cache.db schema, populated at headRef
    └── delta.db                    # ContractChange / PathDelta / IndirectImpactPath
```

`state.db` (review state, history, comments) is shared across modes. Approvals are keyed to node identity + content hash, so a status set during walkthrough mode applies to comparison mode too, with staleness rules per `08-review-state.md`.

### Signature extraction

The JS/TS adapter extracts `NodeSignature` for every analyzable node during parse. Cost is negligible — ts-morph already walks the AST.

- `params`: name, type text (verbatim from source, not resolved), default presence + text, optional flag, rest flag.
- `returnType`: type text if annotated; null otherwise. We do not invoke type inference for comparison — explicit annotations only. Inferring return types across two snapshots is a source of false-positive contract changes we avoid.
- `exported`: derived from declaration position.
- `bodyHash`: SHA-256 of normalized AST text (whitespace collapsed, comments removed). Same hash used for staleness detection in `04-persistence.md`.
- `bodyKind`: filled in by Stage 3 (comparison time), not parse time. Stored back into the per-ref signature row when the comparison completes.

Adapters for other languages must produce the same structure to participate in comparison mode.

## Stage 3 — Delta and risk

Pure code, no LLM. Runs after both single-commit analyses complete.

### Substep A — Signature diff

For every `nodeIdentity` present in either run:

1. If present in head only → emit `ContractChange { kind: 'export_added' }` if it's exported in head; otherwise no contract change.
2. If present in base only → emit `ContractChange { kind: 'export_removed' }` if it was exported in base; otherwise no contract change.
3. If present in both → compare `NodeSignature.params`, `returnType`, `exported`. Emit one `ContractChange` per detected difference kind.

Param-level kinds are detected by aligning params positionally and by name (best-effort: same name → same param even if position changed).

### Substep B — Affected callers

For each `ContractChange`, query the head run's `call_edges` table for all edges where `calleeIdentity == ContractChange.nodeIdentity`. Each edge becomes an `AffectedCaller`. Cross-reference each caller against the head run's `path_nodes` to set `callerOnChangedPath` and `callerOnAnyWalkedPath`.

For `param_default_removed` and `param_added_required`, additionally inspect the call site at head: count argument positions, decide whether the caller passes the argument. Set `callPassesArgument` accordingly. This is a structural check on the AST of the call expression — not a type-flow analysis.

### Substep C — Path-pair alignment

Pair base and head paths by **strict identity**:

1. Match by `entryPointKey` (`framework + kind + route` — e.g., `express + http_route + POST /api/login`). This is stable across cosmetic changes to handler bodies.
2. For matched pairs, compute the path-delta classification by comparing ordered node identities and bodies.
3. For unmatched paths, emit `net_new` (head only) or `net_gone` (base only).

We **do not** use LLM-assisted alignment in v1. Strict identity is robust and predictable; a path that was rewritten enough to lose its entry point match falls into `net_new` + `net_gone`, and the reviewer can confirm the pairing manually if needed. An LLM-suggested re-pairing pass is a candidate for a future iteration but is not load-bearing.

### Substep D — Per-position alignment

For matched path-pairs, compute the position-level alignment:

1. Diff the ordered list of node identities at base vs. head using a Myers-style diff (longest common subsequence).
2. For each aligned position, compute `change_kind`:
   - Both sides null → impossible (excluded from output).
   - Both sides set, same identity, body unchanged → `unchanged`.
   - Both sides set, same identity, body changed → `body_changed` (further classified into `behavioral` / `cosmetic` via `bodyKind`).
   - Head only → `added`.
   - Base only → `removed`.
   - Both sides set, different identity → `replaced`.

Cosmetic changes are emitted as `change_kind = unchanged` with a `bodyKind = cosmetic` marker so the reviewer can opt-in to seeing them.

### Substep E — Indirect impact

For each `ContractChange`:

1. Query the head run's `path_nodes` for paths whose membership includes `ContractChange.nodeIdentity`.
2. Filter to paths whose `PathDelta.classification == unchanged`.
3. Emit `IndirectImpactPath { pathId, contractChangeIds }` (one row per path; multiple contract IDs aggregated).

This is the layer that closes the gap between "I see what changed" and "I see what's at risk."

### Substep F — Persistence

Writes to `delta.db` (one DB per `(baseRef, headRef)` comparison so multiple comparisons can coexist):

- `contract_changes` — one row per `ContractChange`.
- `affected_callers` — one row per `AffectedCaller`.
- `path_deltas` — one row per `PathDelta`.
- `path_delta_positions` — one row per `PathDeltaPosition`.
- `indirect_impact_paths` — one row per `IndirectImpactPath`.

See `04-persistence.md` for column-level schemas.

## Stage 4 — Optional LLM polish

LLM calls in comparison mode are entirely optional. They produce:

| Pipeline | Output | Degradation |
|---|---|---|
| `comparison.contractChangeSummary` | One-sentence "what changed about this contract" | Skipped; UI shows the structural diff only |
| `comparison.pathDeltaNarrative` | Per-`PathDelta` paragraph: "what changed about this path's behavior" | Skipped; UI shows position-level diffs only |
| `comparison.deltaPrepQuestions` | Delta-targeted prep questions (used as PR review-comment seeds) | Skipped; no prep questions |
| `comparison.alignmentSuggestions` | "These look like the same path rewritten — confirm?" pass over `net_new` + `net_gone` | Skipped; pairings stay as detected |

These follow the standard degradation contract from `06-llm-integration.md`. Each pipeline declares its own row in that contract.

## Categorization at the file level

For files (as opposed to nodes), a similar categorization applies:

- **Structural file change**: at least one node has a `ContractChange`.
- **Behavioral file change**: at least one node has `bodyKind = behavioral` (no contract change).
- **Cosmetic file change**: all node body diffs are `bodyKind = cosmetic`.
- **Added** / **Deleted** / **Renamed**: from the file tree (see `09-reanalysis.md`).

The file-level summary is derived; not stored as its own row.

## What this gives the reviewer

The three layers map onto a top-down review surface. UI specifics live in `12-frontend.md`; the data side guarantees:

- **Risks first**: the reviewer sees contract changes and their affected-caller cross-reference before drilling into paths. The default-value-removed case is caught at this layer regardless of whether the path through it is `unchanged`.
- **Paths second**: affected paths grouped by classification, navigable as walkthroughs. Diff hunks render inline at modified positions; the reviewer never has to context-switch to a separate Files Changed view.
- **Untouched-but-at-risk visible**: indirect-impact paths are surfaced as a sub-bucket of "unchanged" so the calming count never lies.
- **Cosmetic noise filtered**: a 200-line PR that's 180 lines of logging doesn't burn the same review attention as a 20-line signature change.

## Boundaries

- **No severity scoring.** A `param_default_removed` is not labeled "high risk" or "low risk." It is labeled `param_default_removed` with affected callers enumerated. Severity is the reviewer's call.
- **No auto-merge gates.** This tool produces information, not gates.
- **No type-flow analysis.** We diff annotated types as text; we do not attempt to determine whether `string | number → string` actually breaks a caller passing a number through three layers of generics. The reviewer evaluates.
- **No cross-file rename inference for nodes.** Function rename detection (within a file) uses the existing similarity heuristic (`09-reanalysis.md`); cross-file moves of a function are treated as removed + added, which surfaces correctly as `export_removed` + `export_added` if the function was exported.

## Testing expectations

- **Signature extraction parity**: fixture pairs (before / after) for each `ContractChange.kind`; assert the diff produces exactly the expected change.
- **Affected-caller enumeration**: fixture with 7 callers, signature change at the callee; assert all 7 surface, with `callPassesArgument` correct for the relevant kinds.
- **Path-pair alignment**: fixtures covering `net_new`, `net_gone`, `restructured`, `modified_in_place`, `unchanged`. Strict-identity matcher must produce stable results across re-runs.
- **Indirect impact**: fixture where path P is unchanged but crosses node N whose signature changed; assert P appears in `indirect_impact_paths`.
- **Cosmetic vs. behavioral**: fixture where the only diff is added log lines; assert `bodyKind = cosmetic` and the position appears as `unchanged` (with cosmetic marker).
- **Comparison-mode persistence isolation**: running two comparisons `(A..B)` and `(A..C)` in succession does not corrupt either delta DB.
- **Degradation**: every LLM pipeline in Stage 4 has a "disabled" test that asserts the structural output is intact.

## Visual design status

The comparison-mode surface is **specified at the data and structural level** by this doc and at the screen / flow / sitemap level by `/docs/design/spec.md` (§5 — Comparison Overview, Path Delta Comparison, Contract Change Detail; §6.5 — comparison flow). Detailed visual layouts for these screens are pending and will be produced as designs land.

This is acceptable for implementation because:

- The data contracts are firm: `ContractChange`, `AffectedCaller`, `PathDelta`, `PathDeltaPosition`, `IndirectImpactPath` (above).
- The screens are sitemap-locked.
- The Path Delta Comparison's canvas treatment is specified in `/docs/design/spec.md` §4.4 (paired xyflow canvases with diff annotations).
- The chip vocabulary for comparison states (`contract-change`, `indirect-impact`, `cosmetic`) is already in `14-design-system.md`.

**Implementation strategy.** Walkthrough-mode UI ships first; the comparison-mode data layer (Stage 3, persistence, tRPC procedures) lands in parallel and is exercised against minimally-styled UI on the comparison routes. Detailed comparison-mode visual design iterates against working data once it's flowing. The constraints visual design must satisfy are in `12-frontend.md` ("Comparison-mode UI patterns").

## What this doc does *not* spec

- **Visual layout** of the comparison surface — owned by `12-frontend.md` and `14-design-system.md`.
- **Specific tRPC procedure signatures** — owned by `07-api-surface.md`.
- **Schema column types** — owned by `04-persistence.md`.

This doc owns the contract; those docs own their respective slices.
