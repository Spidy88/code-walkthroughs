# 04 — Persistence

## Scope

How we store state on disk. SQLite file layout, Drizzle conventions, schema for every persistent domain, migration strategy, and cache vs. state boundaries.

## Out of scope

In-memory caches (see `05-analysis-pipeline.md`). LLM prompt cache contents (see `06-llm-integration.md`).

## Storage layout

All persistent state lives under `~/.code-walkthrough/`.

```
~/.code-walkthrough/
├── config.db                          # User-level: config, recent codebases, user rules
├── config.ts                          # User-authored config (zod-validated on load)
└── codebases/
    └── <codebase-hash>/
        ├── codebase.json              # Pinned metadata: absolute path, first-opened date
        ├── state.db                   # Per-codebase state: review, progress, prep answers
        ├── cache.db                   # Per-codebase cache: analysis, LLM results (working tree)
        └── comparisons/               # Comparison-mode caches; see 13-comparison-flows.md
            └── <base>..<head>/
                ├── base.db            # cache.db schema, populated at baseRef
                ├── head.db            # cache.db schema, populated at headRef
                └── delta.db           # ContractChange / PathDelta / IndirectImpactPath
```

- **`<codebase-hash>`** is a stable hash of the absolute path. If a user moves the codebase, they re-open from the new path and a new hash is minted. State does not auto-migrate; we may add a "relink" tool later.
- **`state.db` is precious.** It holds user-generated state. Never auto-purge.
- **`cache.db` is disposable.** Deleting it triggers re-analysis; no data loss beyond recompute cost.
- **Per-comparison DBs are disposable.** Deleting the entire `comparisons/` directory invalidates all comparison sessions; deleting a single `<base>..<head>/` directory invalidates only that comparison.
- **Two DB files per codebase (plus comparison directories)** is intentional: it lets us nuke any cache without touching review state, and it surfaces the boundary in the file system, not just in code.

## Drizzle setup

Drizzle ORM with `better-sqlite3`. Each DB file has a dedicated schema module:

```
apps/server/src/db/
├── user.ts                 # Opens config.db, returns a typed handle
├── codebase.ts             # Opens a codebase's state.db + cache.db, returns a pair of handles
├── comparison.ts           # Opens a comparison's base.db + head.db + delta.db
├── schema/
│   ├── user/
│   │   ├── config.ts
│   │   ├── recent-codebases.ts
│   │   └── user-rules.ts
│   ├── state/
│   │   ├── review.ts
│   │   ├── comments.ts
│   │   ├── prep-answers.ts
│   │   ├── progress.ts
│   │   └── history.ts
│   ├── cache/
│   │   ├── files.ts
│   │   ├── classifications.ts
│   │   ├── node-signatures.ts    # Comparison-mode prerequisite; populated for all runs
│   │   ├── call-edges.ts
│   │   ├── paths.ts
│   │   ├── preambles.ts
│   │   └── llm-results.ts
│   └── delta/
│       ├── contract-changes.ts
│       ├── affected-callers.ts
│       ├── path-deltas.ts
│       ├── path-delta-positions.ts
│       └── indirect-impact-paths.ts
└── migrations/
    ├── user/
    ├── state/
    ├── cache/
    └── delta/
```

### Conventions

- **Every table has `id` (TEXT, ULID), `createdAt`, `updatedAt`** unless a stronger key applies (e.g., a file's content hash). Use ULID (monotonic, time-sortable, string-friendly) via `@paralleldrive/cuid2` or equivalent.
- **Timestamps are UTC ISO-8601 strings.** No integer epochs; they're harder to read in the DB browser.
- **JSON columns are typed through a Drizzle custom column** that runs a Zod parse on read. If the parse fails, we throw at read time — better than corrupt data leaking.
- **Foreign keys are enforced.** Turn on `PRAGMA foreign_keys = ON` at connection open.
- **`PRAGMA journal_mode = WAL`** on both `state.db` and `cache.db`. It's local single-process but WAL is still the right default.
- **Indexes are named explicitly** — `idx_review_node_id`, `idx_paths_project_id` — not auto-named.

### Transactions

- **Wrap multi-statement writes in a transaction.** Drizzle makes this easy; use it.
- **Do not nest transactions.** `better-sqlite3` handles savepoints but nesting invites confusion.
- **Long-running analysis steps** write in small transactions, not one giant one. This keeps the DB responsive and limits blast radius on cancellation.

## Schemas

The following is the normative schema set. When adding fields, update this section in the same PR.

### User-level (`config.db`)

**`recent_codebases`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | ULID |
| `hash` | TEXT UNIQUE | Stable codebase hash |
| `absolute_path` | TEXT | Last known path |
| `label` | TEXT NULL | Optional user-assigned name |
| `last_opened_at` | TEXT | ISO-8601 |
| `created_at` | TEXT | |

**`user_rules`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | ULID |
| `classification` | TEXT | What this rule applies to |
| `tier` | TEXT | `builtin` | `shell` | `llm` |
| `definition` | JSON | Tier-specific payload |
| `enabled` | INTEGER | 0/1 |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

**`user_config`** (single-row key/value)

| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | e.g., `default_llm_model` |
| `value` | JSON | |

### Per-codebase state (`state.db`)

**`review_status`**

A node has exactly one current status. Prior statuses live in `review_history`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `node_identity` | TEXT | Stable identity: `<project>:<file-path>:<symbol-path>` |
| `scope` | TEXT | `global` | `path:<path-id>` |
| `status` | TEXT | `approved` | `rejected` | `info_requested` |
| `comment` | TEXT NULL | Justification (required for `info_requested`) |
| `code_hash` | TEXT | Content hash of the reviewed code at action time |
| `reviewer_id` | TEXT | From session; single-reviewer in v1 |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

Unique constraint: `(node_identity, scope)`.

**`review_history`**

Append-only log of prior status actions. Same columns as `review_status` plus `superseded_at`. Written when `review_status` is updated or cleared.

**`comments`**

Free-form comments. Independent of status.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `anchor_kind` | TEXT | `file` | `function` | `line` |
| `file_path` | TEXT | Always set |
| `function_identity` | TEXT NULL | Set when anchor is `function` or `line` |
| `line_start` | INTEGER NULL | Set when anchor is `line` |
| `line_end` | INTEGER NULL | Set when anchor is `line` |
| `body` | TEXT | |
| `reviewer_id` | TEXT | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

**`prep_answers`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `question_key` | TEXT UNIQUE | Deterministic key describing the question |
| `question_kind` | TEXT | `classification` | `path_branch` | `entry_point` | `intent` | `rename` |
| `answer` | JSON | Shape depends on kind; Zod-validated on read |
| `answered_at` | TEXT | |

**`progress`**

Cached counters. Recomputable from `review_status`; kept here so dashboards don't rescan.

| Column | Type | Notes |
|---|---|---|
| `scope_kind` | TEXT PK part | `codebase` | `project` | `path` | `file` |
| `scope_id` | TEXT PK part | |
| `approved` | INTEGER | |
| `rejected` | INTEGER | |
| `info_requested` | INTEGER | |
| `pending` | INTEGER | |
| `total` | INTEGER | |
| `updated_at` | TEXT | |

### Per-codebase cache (`cache.db`)

**`files`**

| Column | Type | Notes |
|---|---|---|
| `path` | TEXT PK | Project-relative |
| `content_hash` | TEXT | SHA-256 of file bytes |
| `language` | TEXT | |
| `size` | INTEGER | |
| `analyzed_at` | TEXT | |

**`classifications`**

| Column | Type | Notes |
|---|---|---|
| `node_identity` | TEXT PK | |
| `classification` | TEXT | |
| `confidence` | TEXT | `high` | `medium` | `low` | `none` |
| `source` | TEXT | `stage1` | `stage2` | `prep` |
| `content_hash` | TEXT | Of the file at classification time |
| `justification` | TEXT NULL | One-sentence, from LLM or rule |
| `updated_at` | TEXT | |

**`paths`**, **`path_nodes`**, **`preambles`** — see `05-analysis-pipeline.md` for their shape; they belong to cache.

**`llm_results`** — see `06-llm-integration.md`.

**`node_signatures`**

Populated for every analyzed node. Comparison mode reads this from both ref-specific cache DBs to compute contract changes; walkthrough mode also writes it (cheap during parse), so opening comparison mode on a previously-analyzed codebase does not re-walk the AST.

| Column | Type | Notes |
|---|---|---|
| `node_identity` | TEXT PK | |
| `params` | JSON | `NodeSignatureParam[]` (see `13-comparison-flows.md`) |
| `return_type` | TEXT NULL | Verbatim from source; null if un-annotated |
| `exported` | INTEGER | 0/1 |
| `body_hash` | TEXT | Normalized AST hash of body |
| `body_kind` | TEXT NULL | `structural` \| `behavioral` \| `cosmetic` \| `unchanged` — filled in during comparison; null in plain walkthrough mode |
| `content_hash` | TEXT | File content hash at extraction time |
| `updated_at` | TEXT | |

**`call_edges`**

Per-file call edges, persisted so the comparison stage can enumerate callers without reparsing.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | ULID |
| `caller_node_identity` | TEXT | |
| `callee_node_identity` | TEXT NULL | Null when unresolved |
| `unresolved_hint` | TEXT NULL | `indirect` \| `cross-file-or-external` \| `handler-attached` |
| `call_site_line` | INTEGER | |
| `call_site_column` | INTEGER | |
| `arg_count` | INTEGER | Used by Stage 3 to determine `callPassesArgument` |

Indexed on `caller_node_identity` and `callee_node_identity`.

### Per-comparison delta (`comparisons/<base>..<head>/delta.db`)

Populated by the Delta and Risk stage (`13-comparison-flows.md`). Disposable: deleting `delta.db` re-runs only Stage 3, leaving `base.db` and `head.db` intact.

**`contract_changes`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | ULID, stable across re-runs of the same comparison |
| `node_identity` | TEXT | |
| `kind` | TEXT | See `ContractChange.kind` enum in `13-comparison-flows.md` |
| `base_signature` | JSON NULL | Snapshot of the base `NodeSignature`; null on `export_added` |
| `head_signature` | JSON NULL | Snapshot of the head `NodeSignature`; null on `export_removed` |
| `summary` | TEXT NULL | Optional LLM-generated; null when LLM disabled |
| `created_at` | TEXT | |

**`affected_callers`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | ULID |
| `contract_change_id` | TEXT | FK → `contract_changes.id` |
| `caller_node_identity` | TEXT | |
| `call_site_line` | INTEGER | |
| `call_site_column` | INTEGER | |
| `caller_on_changed_path` | INTEGER | 0/1 |
| `caller_on_any_walked_path` | INTEGER | 0/1 |
| `call_passes_argument` | INTEGER NULL | 0/1, only set for `param_default_removed` and `param_added_required` |

Indexed on `contract_change_id`.

**`path_deltas`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | ULID |
| `base_path_id` | TEXT NULL | Null when `net_new` |
| `head_path_id` | TEXT NULL | Null when `net_gone` |
| `classification` | TEXT | `net_new` \| `net_gone` \| `restructured` \| `modified_in_place` \| `unchanged` |
| `entry_point_key` | TEXT | Stable across runs: framework + kind + route |
| `summary` | TEXT NULL | Optional LLM-generated; null when LLM disabled |

Indexed on `entry_point_key` for fast pairing during regeneration.

**`path_delta_positions`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `path_delta_id` | TEXT | FK → `path_deltas.id` |
| `base_position` | INTEGER NULL | |
| `head_position` | INTEGER NULL | |
| `base_node_identity` | TEXT NULL | |
| `head_node_identity` | TEXT NULL | |
| `change_kind` | TEXT | `unchanged` \| `body_changed` \| `added` \| `removed` \| `replaced` |
| `body_kind` | TEXT NULL | When `change_kind = body_changed` or `unchanged`: `behavioral` \| `cosmetic` \| `unchanged` |

Indexed on `path_delta_id`.

**`indirect_impact_paths`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `head_path_id` | TEXT | |
| `contract_change_ids` | JSON | Array of `contract_changes.id` strings |

Indexed on `head_path_id`.

## Content hashing

- **File content hash**: SHA-256 of the raw bytes. Used to detect function body changes, cache invalidation, and review staleness.
- **Node content hash**: SHA-256 of the normalized AST text for the node (whitespace-collapsed, comments removed). This is what `review_status.code_hash` stores — it lets us detect semantic changes, not cosmetic ones.
- **LLM input hash**: SHA-256 of the canonical request payload (prompt name + version + model + input). See `06-llm-integration.md`.

Hashing utilities live in `apps/server/src/util/hash.ts`.

## Migrations

- **Drizzle Kit generates migrations.** They live under `apps/server/src/db/migrations/<db-name>/`.
- **Migrations are checked into git.** Never hand-edit a committed migration; make a new one.
- **On server boot**, each DB runs its pending migrations automatically. Cache DB migrations may choose to drop-and-recreate tables on schema bumps; state DB migrations never do.
- **Destructive migrations on `state.db` require an explicit pre-migration backup.** The server writes `state.db.backup-<timestamp>` next to the DB before applying.
- **Migration files are named `NNN_description.sql`** with a zero-padded three-digit index.

## Resetting state

- **Reset codebase**: delete `~/.code-walkthrough/codebases/<hash>/state.db`. Reopen.
- **Reset analysis cache**: delete `cache.db`. Next analysis recomputes.
- **Reset all comparisons**: delete the `comparisons/` directory under the codebase folder.
- **Reset a single comparison**: delete the matching `comparisons/<base>..<head>/` directory; the next request re-runs both ref analyses and Stage 3.
- **Reset only a comparison's delta layer**: delete only `delta.db` inside the comparison directory; the ref analyses (`base.db` / `head.db`) are reused.
- **Reset progress only**: run `progress:reset` procedure — see `07-api-surface.md`.
- **Reset per-project, per-path, per-file**: scoped reset procedures, same place.

All "reset" operations are explicit user actions. Nothing resets itself.

## What *not* to store in SQLite

- **File contents.** We read from disk on demand.
- **LLM prompt bodies.** Only hashes and responses. See `06-llm-integration.md`.
- **Transient UI state** (scroll position, open panels). Web keeps that in Zustand/URL.
- **Binary blobs.** If we ever need one, it goes to a file under the codebase folder, referenced by path.
