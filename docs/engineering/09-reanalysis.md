# 09 — Re-analysis and Change Handling

## Scope

How the tool handles file changes, function renames, file renames (via git), and commit-range comparison mode ("new code" review). The core invariant is **review state is never silently lost** — it is migrated, marked stale, or archived, but never deleted implicitly.

## Out of scope

Analysis pipeline internals (see `05-analysis-pipeline.md`), review state machine (see `08-review-state.md`).

## Triggers

Re-analysis is **explicit**. Triggers:

1. **User action**: `analysis.reanalyze` procedure from the UI.
2. **Opening a codebase**: if the codebase has been seen before, re-analysis runs automatically with cache enabled (no force). Unchanged files are no-ops.
3. **Comparison refs changed**: calling `analysis.setComparison` re-runs path detection with the new refs (see "Comparison mode" below).

**No file watcher in v1.** If a user wants to pick up edits mid-session, they click "Re-analyze" or reopen the codebase.

## Change detection

For each file in the codebase:

1. Read current content. Compute `content_hash`.
2. Compare against `cache.db.files.content_hash` for the same path.
3. Classify file as:
   - **Unchanged**: hashes match. Skip parse, skip classify. All cached analysis valid.
   - **Modified**: hashes differ, path exists in both old and new trees. Reparse, re-classify, re-trace affected paths.
   - **Added**: path not present in old cache.
   - **Deleted**: path present in old cache but not found on disk.

Added, modified, and deleted files feed the rename-detection stage below.

## Function-body changes

For each function in a modified file:

1. Compute the new node content hash.
2. If a `review_status` row exists for this node identity with a different `code_hash`, the node transitions to `reviewed_stale` (see `08-review-state.md`).
3. The prior status, comment, and timestamp remain on the row. A `staleness_detected_at` timestamp is set.
4. The UI displays the node with a "previously [approved|rejected|info-requested] — modified since" badge and a diff view.
5. Progress metrics reclassify the node as unreviewed for coverage purposes, but the node appears in the "needs attention — stale" bucket, not the "never reviewed" bucket.

**Nothing auto-approves.** The reviewer must take a new action.

## Function renames

Detection runs when a file has had:
- A known function disappear, AND
- A new function appear.

Both within the same file, in the same re-analysis pass.

### Similarity heuristic

For each pair (removed, added):

- **AST-shape similarity**: compare normalized AST structure (identifier names stripped, literals replaced with placeholders). Use a tree edit distance ratio.
- **Token overlap**: Jaccard similarity on the set of identifier tokens.
- **Signature similarity**: parameter count and type signature match.

Combined score = weighted average. Threshold is configurable (`user_config.rename_similarity_threshold`, default `0.75`).

Above threshold: flagged as a **possible rename**. Below: treated as independent add + delete.

### Surfacing

Rename candidates surface in two places:

1. **Prep pass** on next UI open of the codebase: "This looks like `oldName` renamed to `newName`. Carry approval forward?"
2. **In-walkthrough prompt** when the reviewer first encounters the renamed node.

### Resolution

- **Confirmed**: `review_status.node_identity` is updated to the new identity, `review_history` records the rename, comments with `function_identity` matching the old one have their identity updated.
- **Rejected**: the new function is treated as new and unreviewed. The old function's review rows are archived (see "Archival" below).

Rename detection never runs automatically — it is always a prompt.

## File renames

File-level rename detection uses git, and only when:

1. The codebase root is a git repository (contains `.git/`).
2. Comparison mode is active (two commit refs specified) **OR** the user explicitly triggers `analysis.detectFileRenames`.

For the **comparison mode** case: rename detection runs between `baseRef` and `headRef` using `git diff --find-renames` with the default similarity (50%).

For the **explicit** case: the tool compares the git HEAD tree to what it last cached. This is the only situation in v1 where we read a commit that isn't one the user explicitly provided.

### Implementation

All git operations go through `apps/server/src/git/git.ts`. The rename detector:

```ts
export async function detectFileRenames(
  baseRef: string,
  headRef: string,
  deps: { cwd: string }
): Promise<readonly FileRename[]>;

export type FileRename = {
  readonly oldPath: string;
  readonly newPath: string;
  readonly similarity: number; // from git
};
```

Uses `git diff --name-status -M <base> <head>` and parses `R<score>` lines.

### State migration on confirmed file rename

When a file rename is confirmed:
- `review_status` rows with `file_path = oldPath` → `file_path = newPath`.
- `comments` rows with `file_path = oldPath` → `file_path = newPath`.
- `cache.db.files` entry migrates similarly.
- `review_history` records the rename event.

### Without git or without comparison refs

Moved files are treated as delete + add. The user can still manually confirm via the prep pass if they want to transfer state.

## Archival

When review state cannot cleanly migrate (rejected rename, deleted file, orphaned comment):

- Rows are **not deleted**.
- An `archived_at` timestamp is set.
- The UI surfaces an "archived review state" list where the reviewer can inspect, restore (if the anchor is back), or purge.
- Archived rows are excluded from progress calculations.

Purging archived state is a manual action: `review.purgeArchived({ olderThan?: Date })`.

## Comparison mode ("new code" review)

For PR-style review and AI-generated-code review.

### Setting comparison refs

`analysis.setComparison({ baseRef, headRef })` is called by the UI. The server:

1. Validates both refs exist via `git rev-parse`.
2. Stores them in session state (persisted in `state.db.session`).
3. Triggers re-analysis in comparison mode.

`analysis.setComparison({ ... }) with null` clears comparison mode.

### What comparison mode changes

- **File tree**: read at both commits via `git ls-tree`. This is where added / modified / renamed / deleted classification comes from — authoritatively, not by scanning the working tree.
- **Analysis runs against the head snapshot.** The working tree is not read in comparison mode — we use `git show <headRef>:<path>` to read file contents.
- **Nodes are tagged** with a `change_kind` on `cache.db.path_nodes`:
  - `new` — function added between base and head.
  - `modified` — function body differs.
  - `renamed` — function identity changed (tracked by rename detection).
  - `unchanged_context` — function unchanged, appears on a path that touches changed code.
- **Path ordering** switches to "paths touching changed code first, then paths touching only context" — overrides the default ordering in §7.1.1.
- **Progress** surfaces an additional bucket: "changed-code coverage" — fraction of `new | modified | renamed` nodes that have a current status action.

### Functions approved in a different context

When a previously-approved function now appears on a path that also touches `new` or `modified` code, the UI flags it: "approved elsewhere — review usage here?" This is the path-context awareness hook from spec §8.4. The reviewer can:

- Accept: no change; status stays global.
- Re-approve for this path: creates a `path:<id>`-scoped status.
- Reject for this path: creates a `path:<id>`-scoped rejection.

### Rebase and comparison

If the user rebases the reviewed branch, the specified refs may no longer exist or may point at unexpected commits. The tool:

- Validates refs on every comparison-aware operation. If validation fails, the UI prompts the reviewer to pick new refs.
- Review state keyed to `node_identity` (not commit SHA) survives rebase. The comparison range itself does not.
- Rebase-safe migration of the comparison range is deferred to post-v1.

## Re-running specific parts

- `analysis.reanalyze()` — incremental; runs on changed inputs only.
- `analysis.reanalyze({ force: true })` — drops cache, full re-run.
- `analysis.reanalyze({ scope: 'classifications' })` — re-runs Stage 1 + Stage 2 only.
- `analysis.reanalyze({ scope: 'paths' })` — re-runs path detection only.
- `analysis.reanalyze({ scope: 'llm' })` — clears LLM cache and re-runs all LLM-using stages.

## Events during re-analysis

The same `AnalysisEvent` stream from `05-analysis-pipeline.md` is used. Additional event kinds specific to re-analysis:

```ts
| { kind: 'file_change_detected'; path: string; change: 'added' | 'modified' | 'deleted' }
| { kind: 'rename_candidate'; oldIdentity: string; newIdentity: string; similarity: number }
| { kind: 'staleness_detected'; count: number }
```

These drive the UI's re-analysis summary panel.

## Testing expectations

- **Function rename**: construct two fixtures (before / after), run the rename detector, assert similarity score and carry-forward semantics on confirm.
- **File rename via git**: construct a git fixture with a rename commit, run comparison mode, assert review state migrates.
- **Staleness transition**: mutate a fixture's function body, re-analyze, assert node is `reviewed_stale` with history preserved.
- **Comparison mode correctness**: verify `change_kind` tags match git diff output for a fixture with all four change kinds.
- **Orphaned comments**: delete a function, re-analyze, assert comment is archived and surfaced.
