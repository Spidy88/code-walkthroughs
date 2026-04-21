# 08 — Review State

## Scope

The state machine behind review status, how status interacts with free-form comments, cascade rules for file-level actions, and path-context scoping. This doc defines the invariants that the database and API must preserve.

## Out of scope

UI affordances (see `12-frontend.md`), how stale review state is handled after re-analysis (see `09-reanalysis.md`).

## Node status — the state machine

A node is in exactly one of four states at any moment:

| State | Definition | Coverage counted? |
|---|---|---|
| `never_reviewed` | No status action has ever been taken, or reviewer has explicitly cleared status | No |
| `reviewed_current` | A status action exists and the node's content hash matches the action's `code_hash` | Yes |
| `reviewed_stale` | A status action exists but the node's content hash no longer matches | No |
| `info_requested` | Most recent action is `request_info`; the reviewer has reviewed the node and is awaiting author response | Yes (counted as reviewed, distinguished in UI) |

Transitions:

```
never_reviewed ──[setStatus(approve|reject)]──▶ reviewed_current
never_reviewed ──[setStatus(request_info + comment)]──▶ info_requested

reviewed_current ──[setStatus(X)]──▶ reviewed_current  (prior moves to history)
reviewed_current ──[clearStatus]──▶ never_reviewed    (prior moves to history)
reviewed_current ──[code changes, re-analysis]──▶ reviewed_stale

reviewed_stale ──[setStatus(X)]──▶ reviewed_current

info_requested ──[setStatus(X)]──▶ reviewed_current
info_requested ──[clearStatus]──▶ never_reviewed
```

### Invariants

1. **One current row per `(node_identity, scope)`** in `review_status`. Attempting to write a second current row is a bug.
2. **Every status transition appends to `review_history`.** History is append-only.
3. **`code_hash` is captured at action time**, never updated after. Stale detection compares current node hash to `code_hash` in the row.
4. **Comment on `request_info` is required.** On `approve` and `reject`, optional. Validation enforced by the Zod schema on the input.
5. **The reviewer always sees the `why`** — when a node is `reviewed_stale`, the UI displays the prior status, its comment, and a diff to the current code.

## Status scopes

A status row has a `scope` column:

- `global` — default. The status applies to the node regardless of which path surfaces it.
- `path:<path_id>` — path-scoped. Applies only when the node is encountered via that specific path.

### Default is global

From spec §8.4: approvals are global unless the reviewer opts into path scoping at the moment of action. This is enforced in the API: `review.setStatus` takes an optional `pathScope?: string` field. If omitted, the status is global.

### Path scoping semantics

- A path-scoped status coexists with a global status on the same node. The UI surfaces both.
- When encountering a node via a path:
  - If a `path:<current_path>` scoped status exists → that is the authoritative status for this appearance.
  - Else if a `global` status exists → authoritative.
  - Else `never_reviewed`.
- A path-scoped approval can be **promoted to global** via `review.promoteScopedApproval`.

### When path scoping is **not** allowed

- **Outside walkthroughs.** File browser actions and file-level cascades are always `global`. The API rejects `pathScope` on these procedures.

### Reviewed-function reuse

Spec §7.2 — when a dig-into target has a prior status, the UI shows the prior status and offers Skip / Re-examine. This is purely a UI affordance driven by querying `review_status`. No new status scope is needed.

## File-level cascades

A file-level status action cascades to every function in the file. Mechanics:

1. Reviewer calls `review.setFileStatus({ filePath, status, comment? })`.
2. Server enumerates all functions in that file from `cache.db`.
3. Server checks for existing function-level statuses on those functions.
4. If there are **no conflicts**, all functions receive the cascaded status. Each row records `source = 'cascade'` and `source_file = filePath`.
5. If there **are conflicts**, the procedure returns a conflict payload to the UI (no writes yet). The UI prompts:
   - **Preserve function statuses** (default): cascade applies only to functions without a current status.
   - **Override**: existing function-level statuses are cleared (moved to history) and the cascade applies to all.
   - **Cancel**: no writes.
6. The UI calls `review.setFileStatus` again with the resolution mode: `{ filePath, status, comment?, conflictResolution: 'preserve' | 'override' }`.

### Cascade invariants

- **Cascades never propagate upward.** A function-level action does not change file-level status.
- **A cascade is not a separate record.** Each affected function gets its own `review_status` row. The file-level intent is recorded in `review_history` on each function ("applied via cascade from file X at time T") so history tells the story.
- **Cascade does not apply to functions in hidden or ignored files.** The analyzer marks those; the cascade skips them.

## Free-form comments

Comments are independent of status. Rules:

- **Anchor kinds**: `file`, `function`, `line`.
  - `file` — attached to a file; no function or line info.
  - `function` — attached to a node; file_path + function_identity.
  - `line` — attached to a range within a function; file_path + function_identity + line_start + line_end.
- **Multiple comments per anchor are allowed.** They are independent rows.
- **Comments persist across status changes.** Clearing a status does not delete comments.
- **Comments persist across re-analysis** unless the anchor becomes unreachable (function deleted, file deleted). In that case, the comment is archived: a flag `archived_at` is set, the row remains, and the UI surfaces it in an "orphaned comments" list. See `09-reanalysis.md`.

## Line-anchored comments and code changes

When a line-anchored comment's function body changes:
- If the referenced lines still exist (best-effort match via line-number heuristics on the diff), the comment stays anchored, with `updated_line_start` / `updated_line_end` fields reflecting the new position.
- If the lines no longer exist, the comment is **demoted to a function-level comment** with a note "originally anchored to lines X–Y (removed)".
- Comments are never silently dropped.

## Status + comment interaction

A status action may carry a single accompanying comment (the action's justification). This lives in the `review_status.comment` column, not `comments` table — it is part of the status's identity.

- For `request_info`: required, and this is the question to the author.
- For `approve`/`reject`: optional justification.

Reviewers add additional notes via free-form comments (separate rows).

## Progress implications

Given the four-state model:

| State | Appears in "reviewed" count? | Appears in "needs attention" count? |
|---|---|---|
| `never_reviewed` | No | Yes (as "unreviewed") |
| `reviewed_current` | Yes | No |
| `reviewed_stale` | No | Yes (as "stale — re-review") |
| `info_requested` | Yes | Yes (as "awaiting response") |

The two "needs attention" buckets are distinguished in the UI so reviewers can separate "haven't looked yet" from "looked before but code changed."

**Path coverage** and **full coverage** (spec §10) are computed independently:

- **Path coverage**: all nodes on all detected paths are `reviewed_current` or `info_requested`.
- **Full coverage**: every file in the codebase has at least one `reviewed_current` node or a file-level `reviewed_current` cascade.

Neither is "required to finish" — reviewer-defined.

## Reviewer identity

All rows carry `reviewer_id`. In v1 there is a single reviewer per installation, but the column is present so multi-reviewer features can be added without a migration. Procedures read the reviewer from session context; the UI never passes it.

## Service module

Status transitions are implemented in `apps/server/src/review/status.ts`. The procedures in `router/review.ts` are thin wrappers.

Key functions:

```ts
export async function setNodeStatus(
  input: SetStatusInput,
  { ctx }: { ctx: ScopedContext }
): Promise<ReviewStatusRow>;

export async function clearNodeStatus(
  nodeIdentity: string,
  scope: StatusScope,
  { ctx }: { ctx: ScopedContext }
): Promise<void>;

export async function setFileStatus(
  input: SetFileStatusInput,
  { ctx }: { ctx: ScopedContext }
): Promise<SetFileStatusResult>; // either { kind: 'applied' } | { kind: 'conflict', conflicts: [...] }

export async function promoteScopedApproval(
  nodeIdentity: string,
  pathScope: string,
  { ctx }: { ctx: ScopedContext }
): Promise<ReviewStatusRow>;
```

All writes happen in a single transaction per call.

## Testing expectations

- **Unit tests cover every transition** in the state machine, including invalid transitions (e.g., setting `request_info` without a comment must fail at the schema boundary, never at the service).
- **Cascade conflict resolution is tested end-to-end** — preserve, override, cancel.
- **Path-scope visibility is tested**: a global approval is visible on every path; a path-scoped approval is visible only on its path.
- **Staleness transition**: mutate a file's content, trigger re-analysis, assert the node moves from `reviewed_current` to `reviewed_stale` without losing its prior status in history.

See `10-testing.md` for how test fixtures construct these scenarios.
