# 05 — Analysis Pipeline

## Scope

The full analyzer: how a codebase becomes the data that walkthroughs need. Stages, contracts, adapter interface, entry-point detection, path detection, and preamble construction. This is the heart of the tool.

## Out of scope

LLM specifics (see `06-llm-integration.md`), persistence details (see `04-persistence.md`), UI concerns (see `12-frontend.md`).

## Pipeline overview

```
ingest → parse → classify → detect entries → detect paths → categorize paths
```

Each stage:
- Takes a typed input from the previous stage (or the orchestrator).
- Writes its output to `cache.db` under its own tables.
- Is independently re-runnable. Re-running with unchanged inputs is a no-op.
- Accepts an `AbortSignal`.
- Emits progress events (see "Progress events" below).

The orchestrator lives in `apps/server/src/analysis/run.ts`. The stage implementations live under `packages/analyzer/src/`. The orchestrator handles I/O (file reads, DB writes, LLM callbacks); the analyzer is pure.

## The Adapter interface

```ts
export type Adapter = {
  readonly language: string;                 // 'javascript' | 'typescript' | ...
  detect(project: ProjectMeta): boolean;     // Quick check: does this project use this language?
  parseFile(input: ParseInput): ParseOutput; // AST, symbols, intra-file call graph
  resolveSymbols(input: ResolveInput): ResolveOutput; // Cross-file resolution
  classifierSignals: ClassifierSignalSet;    // Stage 1 signals (declarative)
  frameworkAdapters: readonly FrameworkAdapter[];
};

export type FrameworkAdapter = {
  readonly name: string;                     // 'express' | 'next' | 'nest' | ...
  detect(project: ProjectMeta): boolean;
  detectEntryPoints(input: FrameworkInput): readonly EntryPoint[];
  classifierSignals: ClassifierSignalSet;    // Additional signals for this framework
  resolveDispatch?(input: DispatchInput): DispatchResolution | null;
};
```

### Adapter rules

- **Pure.** No I/O, no network, no singletons. Input in → output out.
- **Idempotent.** Same input → same output.
- **Does not import from `@cw/analyzer`.** Analyzer orchestrates adapters; adapters do not call the analyzer.
- **Adds its own test fixtures under `fixtures/<adapter>/`.**

The JS/TS adapter is the reference implementation. Adding a new language means writing a new adapter module; no core changes required.

## Stage 0 — Architectural summary (optional, LLM)

**When it runs**: once per project, before classification, only if LLM features are enabled.

**Input**: the project's directory tree (paths only, no file contents), plus top-level `package.json`.

**Output**: `ArchitecturalHints` — free-form notes the classifier uses as priors.

```ts
type ArchitecturalHints = {
  readonly layoutConvention: 'layered' | 'feature-based' | 'ddd' | 'ad-hoc' | 'unknown';
  readonly likelyFrameworks: readonly string[];
  readonly notes: string; // one-paragraph summary, for Stage 2 prompt context
};
```

**Degradation**: skip. Stage 1 proceeds without priors. No user-visible banner; this pass is internal tuning.

**Persistence**: stored in `cache.db.classifications_meta` keyed by project hash.

## Stage 1 — Deterministic classification

**When it runs**: always, immediately after parse.

**Input**: for each file, its AST and symbols from the adapter, plus the adapter's `ClassifierSignalSet`.

**Signals** are declarative:

```ts
type ClassifierSignal = {
  readonly name: string;
  readonly weight: 'high' | 'medium' | 'low';
  readonly kind: 'path-pattern' | 'filename-pattern' | 'ast-marker' | 'import-based';
  readonly matcher: SignalMatcher; // typed per kind
  readonly yields: Classification;
};
```

**Output**: for each file, one or more candidate classifications with an aggregate confidence.

**Aggregation rules**:
- Any `high`-weight signal matching → `high` confidence if uncontested.
- Multiple `medium` signals agreeing → `high` confidence.
- One `medium` signal, no contradictions → `medium` confidence.
- Only `low` signals → `low` confidence.
- No signals → `none` confidence, classification `unclassified`.
- Contradicting signals of similar weight → `low` confidence, flagged for Stage 2/3.

**Persistence**: `cache.db.classifications` with `source = 'stage1'`.

## Stage 2 — LLM augmentation

**When it runs**: for files where Stage 1 confidence is below `high`, if LLM is enabled.

**Input**: file contents (truncated to model limits with a deterministic strategy — keep top of file, function signatures, exports), Stage 1 candidate, Stage 0 hints.

**Output**: a classification, a confidence, and a one-sentence justification.

**Reconciliation**:
- Stage 1 high + Stage 2 high agree → `high` (store Stage 1 as source of truth; Stage 2 justification attached).
- Stage 1 medium/low + Stage 2 high + agreement → `high`, source `stage2`.
- Disagreement at any confidence → `low` confidence, flagged for Stage 3.
- Stage 2 low + Stage 1 low → `low`, flagged for Stage 3.

**Degradation**: skip. Stage 1 results stand; low-confidence items flow into Stage 3's prep queue without a suggestion chip.

**Persistence**: `cache.db.classifications` updated with `source = 'stage2'` where applicable.

## Stage 3 — Prep-question generation

**When it runs**: after Stage 2 (or immediately after Stage 1 if LLM disabled).

**Input**: all unresolved items — low-confidence classifications, unresolved path branches, and entry-point confirmations.

**Output**: `PrepQuestion[]` written to `cache.db.prep_questions` (distinct from `state.db.prep_answers` which stores reviewer responses).

Each prep question:

```ts
type PrepQuestion = {
  readonly key: string;          // deterministic; persists across re-analysis
  readonly kind: 'classification' | 'path_branch' | 'entry_point' | 'intent' | 'rename';
  readonly context: PrepContext; // kind-specific payload
  readonly suggestion: PrepSuggestion | null;   // LLM-proposed; null if LLM disabled
  readonly alternatives: readonly PrepSuggestion[]; // LLM-proposed; empty if LLM disabled
};
```

**Degradation**: prep questions still exist; `suggestion` is `null` and `alternatives` is empty. The UI renders a blank composition field instead of a clickable chip.

## Entry-point detection

Driven by framework adapters. Each framework adapter returns an `EntryPoint[]` per project.

```ts
type EntryPoint = {
  readonly id: string;
  readonly kind: 'http_route' | 'cli_command' | 'job' | 'event_handler' | 'frontend_route' | 'pinned';
  readonly framework: string;       // 'express' | 'next' | 'tanstack-router' | ...
  readonly projectId: string;
  readonly nodeIdentity: string;    // The function that runs when this entry point fires
  readonly metadata: Record<string, unknown>; // framework-specific (method, path, etc.)
};
```

**User-pinned entry points** are stored in `state.db` as metadata; the analyzer merges them into the detected set.

**Entry-point confirmation** (Stage 3 prep question): if the adapter reports N entry points, the prep pass asks "N detected. Any missing or spurious?" The user can mark extras as false positives (stored in `state.db`) and pin missing ones.

## Path detection

From each entry point, trace the call graph. The tracer is generic; it consumes the adapter's intra-file call graph plus its cross-file resolution.

### Ambiguity handling

In order:

1. **Deterministic resolution.**
   - Registered routes in a router instance.
   - Factory return types when the type is concrete.
   - `switch` statements with string/enum discriminants where each branch is a known function.
2. **LLM inference** (if enabled). Input: the unresolved call site plus surrounding 30 lines plus each candidate's signature. Output: which candidate runs, with confidence.
3. **Overlap check**: when both deterministic and LLM run, agreement raises confidence. Disagreement flags the branch for Stage 3.
4. **Prep question** if still unresolved.

### Depth limit

Paths materialize up to `config.pathDepthLimit` (default: 8 nodes). Nodes beyond that are not in the path materialization but the call graph edges are retained so "dig into" still works at walkthrough time.

### Cycles

Cycles are truncated with a "cycle-back to <node>" marker. The walkthrough UI renders this as a non-navigable indicator.

### Persistence

- `cache.db.paths` — one row per path.
- `cache.db.path_nodes` — ordered list of nodes per path with fork/branch info.

```ts
type Path = {
  readonly id: string;
  readonly entryPointId: string;
  readonly projectId: string;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly category: string | null;     // populated after categorization
  readonly categoryOrder: number | null;
};
```

## Path categorization & ordering

**LLM-driven, optional.** After paths are detected, an LLM pass groups them into thematic categories and proposes an ordering with a "foundational first" bias.

**Input**: path summaries (entry point, terminal node, 3–5 node names from the path).

**Output**: category assignment per path + category ordering.

**Degradation**: paths presented without categories, ordered deterministically by (project name, entry point location, path complexity ascending).

**Persistence**: category fields on `cache.db.paths`. LLM result cached by the hash of the input summaries.

## Preamble construction

For each entry point, compute:

1. **Environmental preamble**: code that runs before every entry point. For HTTP apps, this is app bootstrap → global middleware → router creation. Detection is framework-specific (the framework adapter supplies it).
2. **Dispatcher preamble**: the dispatching node (router, switch). Not a walkthrough step; rendered as context.

```ts
type Preamble = {
  readonly entryPointId: string;
  readonly environmental: readonly PreambleNode[];   // ordered
  readonly dispatcher: PreambleNode | null;
};

type PreambleNode = {
  readonly nodeIdentity: string;
  readonly role: 'app_mount' | 'global_middleware' | 'provider' | 'router' | 'dispatcher';
  readonly summary: string | null;  // optional LLM-generated; null if LLM disabled
};
```

**Degradation**: `summary` is null without LLM; UI renders the node name and a "show code" affordance.

## Synthetic walkthroughs

Non-path code (configs, seeds, bootstrap) gets curated sequences.

**Detection**: files that (a) were not visited by any path and (b) have classifications in `{ config, seed, script, fixture }`. Grouped by folder and classification.

**Ordering within a group**: LLM-proposed topical order if enabled; alphabetical fallback.

**Persistence**: `cache.db.synthetic_walkthroughs`.

## Progress events

The orchestrator emits events over a typed emitter during analysis. These feed a tRPC subscription that the UI consumes.

```ts
type AnalysisEvent =
  | { kind: 'stage_started'; stage: StageName; total: number }
  | { kind: 'stage_progress'; stage: StageName; done: number; total: number }
  | { kind: 'stage_completed'; stage: StageName }
  | { kind: 'stage_failed'; stage: StageName; error: string }
  | { kind: 'analysis_completed' }
  | { kind: 'analysis_cancelled' };
```

Events carry no large payloads. The UI polls result tables via regular procedures when a stage completes.

## Cancellation

- `runAnalysis(codebase, signal)` respects `signal.aborted`.
- Each stage checks `signal.throwIfAborted()` in its inner loop.
- LLM calls are passed the signal; an aborted call returns immediately.
- On abort, the orchestrator emits `analysis_cancelled`, flushes in-progress writes, and exits cleanly.

## Re-running analysis

- **No-ops on unchanged inputs.** Each stage computes its input hash and skips if the cached output hash matches.
- **Partial re-runs**: if a single file changed, parse + classify run only for that file; path detection re-runs only for paths touching that file; categorization re-runs for affected categories only.
- **Full re-run**: `analysis:reanalyze({ force: true })` drops cache rows and starts from Stage 0.

See `09-reanalysis.md` for how re-analysis interacts with review state.
