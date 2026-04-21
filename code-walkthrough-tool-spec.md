# Code Walkthrough Tool — Product Specification

## 1. Purpose

A local tool that ingests a codebase, analyzes it deterministically, and guides a reviewer through the code along meaningful paths (e.g., an HTTP request from handler to service to external client; a frontend route from its route definition to rendered components). Designed to make unfamiliar codebases approachable, to make large pull requests reviewable without holding the whole system in your head, and to provide a structured review surface for both human-written code and AI-generated code.

The tool is explicitly biased toward deterministic analysis where accuracy matters (parsing, symbol resolution, call graphs), and uses LLMs only where determinism breaks down (ambiguous classification, dynamic dispatch resolution, semantic rule checks).

## 2. Scope

**In scope for v1:**
- Single-reviewer, local operation
- JavaScript and TypeScript codebases (standalone project or monorepo)
- Deterministic AST-based parsing
- Classification and path detection (deterministic + LLM-assisted)
- Guided path walkthroughs and free file browsing
- Per-node review actions (approve, reject, request info, comment)
- Classification-driven checklists with user-authored rules
- Progress tracking per reviewer per codebase
- Re-analysis with function-rename and (via minimal git) file-rename detection
- "New code" review mode via two user-supplied commit refs

**Non-goals for v1:**
- Collaboration, multi-reviewer sync, shared comment visibility
- Deep git history analysis (only two specified commits are ever read)
- Languages beyond JS/TS (architecture must not preclude them)
- Rebase-safe approval migration (reviewers are asked to avoid rebasing reviewed branches)
- Remote / hosted mode
- Codebases that are loose collections of unrelated projects (standalone and monorepo only)

## 3. Core Concepts and Terminology

These terms are used consistently throughout the spec.

- **Codebase**: A directory on disk containing one or more projects.
- **Project**: A single application or package. In JS/TS, typically identified by a `package.json` and/or workspace configuration.
- **Node**: A reviewable unit. Usually a function, sometimes a whole file (for purely declarative or very small files).
- **Entry point**: A starting node for a path. Includes HTTP route handlers, CLI command handlers, scheduled jobs, queue/event consumers, and frontend routes. Also includes anything the user pins as a start node.
- **Path**: An ordered sequence of nodes starting at an entry point, traced through the call graph. Paths may fork.
- **Context preamble**: Code that runs before an entry point but is not part of the active path review (app mount, global middleware, context providers, router). Presented as collapsed context, not as walkthrough steps.
- **Dispatcher-shaped preamble**: A specific type of preamble that selects among many entry points based on input (e.g., a router). Each of its dispatched destinations is itself a distinct entry point.
- **Classification**: The role a node plays (route handler, service, client, helper, component, page, config, script, etc.).
- **Checklist**: A classification-specific set of rules shown when reviewing a node.
- **Rule**: A single check evaluable against a node. Deterministic, LLM-evaluated, or shell-executed.
- **Reviewer**: The identity that owns all user-generated state. Single user per installation in v1; state is nonetheless scoped to a reviewer ID for forward compatibility.
- **Synthetic walkthrough**: A curated review order for code that has no natural path (configs, seeds, bootstrapping).

## 4. Codebase Ingestion

User points the tool at a local directory.

1. The tool detects projects. A standalone project yields one project at the root. A monorepo yields multiple projects, discovered via workspace configurations (npm/yarn/pnpm workspaces, lerna, nx, turborepo, etc.) and by scanning nested `package.json` files.
2. For each project, the tool identifies language(s), framework(s), and primary entry configurations (main, bin, exports, scripts).
3. Projects whose language is not supported by any adapter are listed but marked as not-walkable. They do not block analysis of supported projects.
4. Persistent state is initialized per codebase (see §14).

The ingestion step is idempotent. Running it again on a previously-ingested codebase produces an incremental re-analysis (see §11).

## 5. Code Analysis

### 5.1 Parsing (Deterministic)

Parsing must be deterministic. The JS/TS adapter uses a production-grade AST parser. Outputs per file:

- Symbol table: functions, classes, React components, top-level variables, exports, imports
- Intra-file call graph
- Cross-file import/export graph
- Framework-declarative metadata where applicable (route registrations, JSX component trees, decorators)

LLMs are not used for any structural parsing task. Function boundaries, call sites, and module relationships come from the AST only.

### 5.2 Classification

Each file and each top-level function receives a classification. Classification is layered across four stages (stages 0 and 3 are new; stages 1 and 2 are the original deterministic/LLM flow):

**Stage 0 — Optional architectural summary pass (LLM, once per project, paths only).**

Before per-file classification begins, an LLM optionally reads the project's directory tree (paths only, no file contents) and produces a short architectural summary: likely layout convention (layered, feature-based, DDD bounded contexts, etc.), likely framework stack, and hints that the classifier uses as priors. This pass runs once per project, is inexpensive (no file contents sent), and is only invoked when LLM features are enabled. Its output is hints, not classifications — it cannot finalize a classification on its own.

**Stage 1 — Deterministic signals (always runs).**

Classifications are resolved first from a concrete set of signals. The following is illustrative, not exhaustive — the JS/TS adapter ships with these and similar:

- Path patterns: files under `routes/`, `controllers/`, `handlers/` → `route_handler` candidate; `services/` → `service`; `middleware/` → `middleware`; `hooks/` or files starting with `use*` returning hook-shaped values → `hook`; `pages/`, `app/`, `routes/` with a default export in a JSX-producing file → `page`; `components/` or `*.tsx`/`*.jsx` with JSX returns → `component`; `__tests__/` or `*.test.*`/`*.spec.*` → `test`; `scripts/`, `bin/` → `script`; `seeds/`, `*.seed.*` → `seed`.
- Filename patterns: `*.config.*`, `next.config.*`, `vite.config.*`, `webpack.config.*`, `tsconfig.json`, etc. → `config`; `*.d.ts` with no runtime content → `type_only`.
- Framework markers from AST: Express `Router()` instances with `.get/.post/...` calls; NestJS `@Controller`, `@Get`, `@Post` decorators; Fastify plugins registering routes; Next.js special exports (`getServerSideProps`, route handlers under `app/`); tRPC procedures; TanStack Router route definitions.
- Import-based signals: Prisma/Drizzle/TypeORM client imports → `repository`; SDK imports (Stripe, AWS, etc.) in a file primarily calling the SDK → `client`.

Stage 1 produces a classification with a confidence level (high / medium / low / none). A deterministic signal that matches framework-specific AST markers is high confidence; a signal that matches only a path pattern is medium; weak or conflicting signals are low; no signals is none.

**Stage 2 — LLM augmentation (runs when Stage 1 is below high confidence and LLM features are enabled).**

For files with medium, low, or no confidence, an LLM receives the file contents, the Stage 0 architectural hints, and the Stage 1 candidate classification (if any). It returns a classification with its own confidence and a one-sentence justification. If Stage 1 and Stage 2 agree at acceptable confidence, the classification is accepted. If they disagree, the file is flagged for Stage 3.

**Stage 3 — Author confirmation (via prep pass, §6).**

Files where Stage 1 and Stage 2 disagree, or where both stages are below high confidence, surface in the author prep pass with the candidate classifications as clickable options.

**Initial classification set:** `route_handler`, `service`, `client`, `repository`, `helper`, `middleware`, `component`, `page`, `hook`, `config`, `script`, `seed`, `fixture`, `test`, `type_only`, `unclassified`. The set is extensible — adapters and users can add classifications, and user-defined classifications can carry their own checklists.

### 5.3 Path Detection

From each entry point, the tool traces the call graph to construct paths. Ambiguity (dynamic dispatch, string-keyed routing, polymorphism, factories returning one of N implementations) is handled in order:

1. **Deterministic resolution** where possible (following registered routes in a router instance, reading a factory's return type).
2. **LLM inference** for remaining ambiguity, with confidence scoring.
3. **Overlap check**: when both methods are applied, agreement increases confidence, and disagreement is surfaced to the author. This is the preferred mode when LLMs are enabled.
4. **Prep question** for anything still unresolved.

Paths are materialized up to a configurable depth. Depth limits exist to prevent combinatorial explosion in highly-connected code; the reviewer can always dig further at walkthrough time (§7.2).

### 5.4 Entry Points and Preamble

Entry points are detected per-framework. Common detectors:

- HTTP: Express/Fastify/Koa route registrations, NestJS controllers, Next.js route files, Remix/TanStack routes
- CLI: `bin` entries, argv-dispatching main files
- Jobs and workers: BullMQ/Celery-style consumers, cron registrations
- Events: message bus subscribers, EventEmitter handlers
- Frontend: route components in the active router library

For each entry point, the tool computes its **context preamble chain**:

- **Environmental preamble**: code that runs before all entry points in the app (app mount, global middleware, providers, logging setup). Always available as collapsed context.
- **Dispatcher-shaped preamble**: a router or similar dispatcher. The dispatcher itself is not a walkthrough step for its children — each dispatched destination is its own entry point with the dispatcher visible as context.

Walkthroughs begin **at the entry point itself**, not at its preamble. This is intentional: for nested routes under a router, starting at the router and requiring an immediate "dig into" click adds friction without adding review value. The preamble is one expand away when the reviewer wants it.

## 6. Author Prep Pass

After initial analysis, the tool presents a prep pass where unresolved questions are surfaced. Question types:

- **Ambiguous classification**: "Is `src/lib/mailer.ts` a service or a client?"
- **Unresolved path branch**: "This factory returns one of three implementations. Which runs in production?"
- **Entry point confirmation**: "14 routes detected. Any missing or spurious?"
- **Intent capture (optional)**: "One-sentence purpose of this function?"
- **Possible rename** (on re-analysis, see §11.2)

For each question, an LLM pre-generates a proposed answer and a short list of plausible alternatives **before** the author sees it. The author confirms, picks an alternative, or writes a custom answer. This bounds both LLM cost (one call per question, not continuous) and author effort (click, not compose).

Prep pass is not blocking. Walkthroughs can begin with prep incomplete; quality improves as prep progresses. Questions encountered mid-walkthrough (on-demand Q&A) are written back to the prep data so answers are reused.

## 7. Walkthrough Flows

### 7.1 Guided Path Walkthrough (Primary Flow)

Flow:

1. Reviewer selects a project.
2. Reviewer selects an entry point or a detected path from the **suggested path ordering** (see §7.1.1).
3. Walkthrough opens at the entry point with:
   - The relevant code foregrounded — typically the function body, with an expand affordance for full file context. Code is displayed with **syntax highlighting** appropriate to its language (single default theme, no theme selection in v1).
   - The node's classification and its checklist (§9).
   - Review actions (§8).
   - "Dig into" affordances on downstream function calls made by this node. Calls to previously-reviewed functions are marked and offer Skip / Re-examine (see §7.2).
   - Navigation: previous node, next node along the current path, branch selector if the path forks here.
   - A collapsed "context above" panel showing the preamble chain (router, app mount, etc.).
4. Reviewer proceeds node by node to the path's terminus (typically an external call, a database write, or a returned response).

Only code on the current path is foregrounded. Unrelated functions in the same file are not shown in path mode (they are accessible via the file browser).

Code highlighting **beyond syntax highlighting** — specifically, marking regions that correspond to individual checklist items — is a goal, not a requirement. Such checklist-tied highlights appear only when the tool is confident about the mapping; speculative highlights are suppressed in favor of accuracy.

#### 7.1.1 Path Ordering

Paths are presented in a suggested review order:

- **Categorization (LLM-driven)**: on first analysis, the LLM groups and names paths into thematic categories (e.g., "authentication," "user management," "billing," "admin operations," "integrations"). Category names and membership are cached with analysis results.
- **Within each category**: paths are ordered deterministically, simplest first (by node count, then by depth). This gives the reviewer a progressive-disclosure view — see the shape of a feature area via its simplest paths before tackling complex ones.
- **Across categories**: the LLM proposes an ordering with a "foundational first" bias (auth before billing, reads before writes, bootstrap before steady-state), surfaced as a suggestion the reviewer can override.
- **PR review mode override**: when operating with a commit-comparison range (§11.4), the default ordering switches to "paths touching changed code first, then paths touching context."

The ordering is a suggested reading order, not a lock. The reviewer can reorder categories, reorder paths within a category, or pick any path directly. With LLM features disabled, paths are presented without categorization, ordered deterministically by entry-point location and path complexity.

### 7.2 "Dig Into" Navigation

When the current node calls another function, the reviewer can dig into that call. This pushes the current node onto a navigation stack; the called function becomes the new current node. Popping returns to the caller.

The dig-into stack is orthogonal to main path progression. A reviewer can dig arbitrarily deep for context, then pop back and continue along the main path.

**Reviewed-function handling**: when the dig-into target is a function the reviewer has already taken a status action on (in this walkthrough session or any prior session), the dig-into affordance shows the prior status and offers two options: **Skip** (continue past this call without reopening it) or **Re-examine** (dig in anyway, typically to verify behavior in the current context). The default highlighted choice is Skip. This avoids forcing re-review of every helper that appears across many paths while keeping re-examination one click away.

Actions taken while dug-in apply to the function globally by default. See §8 for path-scoped approval as an explicit opt-in.

### 7.3 File Browser (Secondary Flow)

Lists all projects, then all files within a project. Reviewer can open any file and review holistically. All review actions apply. This flow is the catch-all for:

- Code that doesn't fit a path (configs, scripts, seeds, setup)
- Reviewers who prefer free browsing over guided paths
- Spot-checking specific files

### 7.4 Non-Path Code: Synthetic Walkthroughs

Some code has no natural entry-point path but still benefits from guided review. Examples: build and runtime configuration grouped by concern, seed data, framework bootstrapping (app mount → providers → router setup).

The tool constructs **synthetic walkthroughs** for these: curated sequences of non-path files grouped by topic. Synthetic walkthroughs appear alongside detected paths so the reviewer has a complete coverage plan, not just detected paths.

## 8. Review Actions and Comments

The review surface distinguishes **status actions** (which set a node's review state) from **free-form comments** (which do not).

### 8.1 Status Actions

A node's review status is determined by the most recent status action taken on it. Three status actions exist:

- **Approve**: node is reviewed and acceptable.
- **Reject**: node is reviewed but flagged as needing change.
- **Request info**: node is marked as needing clarification from the author.

Each status action may optionally carry a single accompanying comment that serves as its justification. For Request Info, the accompanying comment is the question itself and is required. For Approve and Reject, the comment is optional.

A node has exactly one current status. Taking a new status action replaces the previous status (with the prior action preserved in the node's review history).

### 8.2 Free-form Comments

Free-form comments are independent of status. They can be attached:

- To a specific line or range of lines within a function (GitHub PR line-comment style).
- To a function as a whole (node-level).
- To a file as a whole (file-level).

Multiple free-form comments can exist on the same node or file. They accumulate. They do not change status. They persist across status changes.

### 8.3 Cascade and Override Rules

- File-level status actions cascade to every function in the file.
- Function-level status actions override any cascaded file-level status for that specific function.
- A function-level status action never propagates upward to its file.
- **Conflict on file-level action**: when the reviewer takes a file-level status action and one or more functions in that file already have a conflicting function-level status, the tool prompts with three choices:
  - **Preserve function statuses** (apply the file action only to functions without an existing status) — default/highlighted choice.
  - **Override** (clear all function-level statuses in the file and apply the file action to every function).
  - **Cancel**.

### 8.4 Path-context Awareness

**Approvals are global by default.** An approval applies to the function regardless of which path it appears in. This avoids multiplying review work for utility and service functions that are legitimately reused across many paths.

**Reuse is surfaced, not gated.** When the reviewer encounters a call to a previously-reviewed function — whether in a different path or at a new call site within the same path — the dig-into affordance shows the prior status and offers Skip or Re-examine (§7.2). This gives visibility into reuse without mandating re-review.

**Path-scoped approval is an explicit opt-in.** For functions the reviewer judges context-sensitive, a status action can be narrowed to "approve for this path only" at the moment of the action. Subsequent appearances of that function in other paths are then marked as "previously approved in path X — not yet reviewed for this path's usage," with the same Skip / Re-examine affordance. The reviewer can later promote a path-scoped approval to global from the function's review history.

**Outside walkthroughs, status actions are always global.** File browser actions and file-level cascades have no path context and always apply globally.

This model addresses the "function reused in a context it wasn't designed for" concern through visibility (reuse is always shown) rather than enforcement (re-approval required), with explicit path scoping available when a reviewer wants stricter handling on a specific function.

## 9. Checklists and Rules

### 9.1 Classification-Driven Checklists

Each classification has a default checklist. Examples (illustrative, not exhaustive):

- **route_handler**: auth checked, authorization checked, input validated, error handling, response consistency
- **service**: single responsibility, caching/performance considerations, side-effect boundaries, error propagation
- **client**: timeout and retry, response validation, error mapping
- **component**: prop contract, accessibility, appropriate memoization, side-effect management
- **config**: secrets not committed, environment separation, sane defaults

Defaults are a starting point. Users override and extend them via rule authoring.

### 9.2 Rule Authoring (Plugin Tiers)

Three rule types are supported:

1. **Built-in pattern rules**: AST-matcher or regex-based rules shipped with the tool. Example: "a route handler must call an `authorize`-shaped function before returning success."
2. **Shell command rules**: user provides a shell command. The tool invokes it with structured input on stdin (describing the node: code, path, classification, framework, metadata) and reads structured output from stdout (pass/fail/skip + message). Exit code is a secondary signal. Any language or tool that can be invoked as a command is supported via this tier.
3. **LLM prompt rules**: user provides a prompt template. The tool fills in node context and parses a structured response.

A richer native plugin interface is not included in v1. Authoring a plugin in any language reduces to a shell command with structured I/O, so the shell command tier is the native plugin surface.

### 9.3 Rule Scoping and Layering

Two scopes:

- **Project-level rules**: stored inside the project directory in a conventional location; checked into version control so teams share them.
- **User-level rules**: stored in the reviewer's personal configuration; apply across all codebases the reviewer walks through.

Merging: for any given classification, the effective checklist is user rules ⊕ project rules. Project rules can enable, disable, or override user rules for that codebase. Each rule in the checklist UI shows its origin (built-in, user, project) so the reviewer knows where it came from.

## 10. Progress Tracking

Per-reviewer, per-codebase tracking:

- **Coverage**: fraction of nodes with any action taken.
- **Composition**: approval vs. rejection vs. info-requested breakdown.
- **Scoped progress**: per-project, per-path, per-file progress indicators.
- **Two coverage flavors**:
  - **Path coverage**: all detected paths walked to completion.
  - **Full coverage**: every file acted upon at least once.
- Both are displayed; neither is required to "finish." Completeness is reviewer-defined.

Progress can be reset at the codebase, project, path, or file level.

## 11. Re-analysis and Change Handling

Re-analysis is triggered by the reviewer or on detection of file changes. It is incremental: files whose AST and dependency inputs are unchanged reuse prior analysis.

### 11.1 Function Body Changes

When a function's body changes after a prior status action, the node's **current status reverts to pending**. The prior status and any associated comments are preserved in the node's review history, not discarded. The node is displayed with a **"previously [approved|rejected|info-requested] — modified since"** indicator, and the reviewer can view the diff between the previously-reviewed version and the current version.

Progress treats the node as unreviewed until the reviewer takes a new status action. Nothing is auto-approved. The history is retained so the reviewer has context ("you approved this three days ago — here's what changed") but it does not contribute to current coverage metrics.

Node status at any moment falls into one of four states:

- **Never reviewed** — no prior status action. Applies to new functions and new files.
- **Reviewed, current** — a status action exists and the code has not changed since.
- **Reviewed, stale** — a status action exists but the code has changed since. Current status is pending; prior status is in history.
- **Explicitly pending info** — Request Info has been taken; the node is reviewed but awaiting author response.

The walkthrough and progress displays distinguish all four states so the reviewer can see at a glance what requires attention and why.

### 11.2 Function Renames

On re-analysis, if a known function is missing from its file and a new function appears in the same file with sufficiently similar body (AST-shape similarity + token overlap above a threshold), the tool flags a **possible rename**. It surfaces this as a prep question or an in-walkthrough prompt: "This looks like `oldName` renamed to `newName`. Carry approval forward?"

Confirmed: approval, comments, and history transfer to the new identity.
Rejected: the new function is treated as new and unreviewed.

### 11.3 File Renames

File-level renames are the one area where the tool uses git, and only when:

- The codebase is a git repository, **and**
- The reviewer has supplied two commit refs for comparison (§11.4).

In that case, git's built-in rename detection is used read-only to map old paths to new paths, and review state transfers across the rename. No history traversal, no branch operations — the tool reads file trees at the two specified commits and asks git which files moved between them.

Without git or without commit refs, moved files are treated as "old deleted, new added." The reviewer resolves via the prep pass if they want to transfer state manually.

### 11.4 "New Code" Comparison Mode

For PR-style review — including review of AI-generated changes, which is the same feature with a different origin — the reviewer provides two commit refs: **base** and **head**. The tool:

1. Reads the file tree at each commit (read-only, no history walk).
2. Computes added, modified, renamed, and deleted files between them.
3. Marks functions as **new**, **modified**, **renamed** (with source), or **unchanged context** in walkthroughs.
4. Runs paths across the head snapshot, with modified-since-approval indicators on functions the reviewer previously approved in a different context.
5. Allows the reviewer to re-review previously-approved functions that now appear in a new usage (ties into path-context awareness, §8).

Reviewers are asked to avoid rebasing reviewed branches. Approvals are keyed to function identity, not commit SHA, so rebase does not destroy approvals — but it does invalidate previously-selected comparison refs. Users who rebase simply pick new refs. Rebase-safe migration of the comparison range itself is deferred.

Without commit refs, the tool operates on a flat snapshot with no new-vs-context distinction.

## 12. Reviewer Identity

All user-generated state (approvals, rejections, comments, info requests, user-level rules, progress) is scoped to a reviewer ID. A single reviewer exists per installation in v1; the reviewer ID is transparent from the user's perspective.

This scoping is a forward-compatibility decision: it allows future addition of multi-reviewer features (shared comment visibility, dog-pile prevention, review assignment) without a data migration. No such features ship in v1; they are deferred pending single-user UX evaluation.

Specifically deferred:
- Real-time sync or async sharing of review state
- Comment threads / replies across reviewers
- Visibility controls (hide others' comments until submission to mitigate dog-piling)
- Review assignment and ownership

## 13. Extensibility

### 13.1 Language Adapters

Language-specific analysis is encapsulated in an adapter. An adapter provides:

- AST parsing
- Symbol and export extraction
- Call graph construction
- Import/export resolution
- Optional framework sub-adapter hooks
- Optional entry point detection hooks

The JS/TS adapter is the first concrete implementation. The core walkthrough, review action, checklist, and progress systems are language-agnostic — they operate on the adapter's output. Adding Python, Go, Ruby, etc. is a matter of writing a new adapter.

### 13.2 Framework Sub-Adapters

Within a language, framework-specific behavior (Express, Fastify, NestJS, Next.js, Remix, TanStack Router, React Router, etc.) layers on top of the language adapter as optional sub-adapters. Framework support is independently shippable — Express support does not require Next.js support.

### 13.3 Rule Plugins

The shell-command rule tier (§9.2) is the rule plugin surface. Any external tool that can consume structured input from stdin and emit structured output on stdout can implement a rule.

## 14. Persistence and State

All state is local. State categories:

- **Analysis results** (per codebase): symbol tables, call graphs, classifications, detected paths, preamble chains.
- **Prep answers** (per codebase, per reviewer).
- **Review state** (per codebase, per reviewer): approvals, rejections, info requests, comments, path-context tags.
- **Progress** (per codebase, per reviewer): derived from review state, cached for performance.
- **User-level rules** (per reviewer): stored in the reviewer's personal configuration directory.
- **Project-level rules** (per project): stored in a conventional location inside the project directory, checked into version control.

Storage medium and format are not fixed by this spec. Requirements: survives between sessions; is per-codebase and per-reviewer for user-generated state; requires no network access; does not depend on the project's own package manager or runtime.

## 15. LLM Usage and Cost Considerations

LLM calls are used for:

- Classification of ambiguous files/functions
- Path inference where deterministic resolution fails
- Pre-generating proposed answers for author prep questions
- Evaluating user-authored LLM prompt rules
- Optional fix/clarification suggestions on reviewer request

LLM usage is not required. With LLM features disabled:

- Classification falls back to deterministic-only, with low-confidence items appearing as prep questions without pre-generated answers.
- Path inference stops at deterministic resolution, with unresolved branches becoming prep questions.
- LLM rule types are unavailable; other rule types are unaffected.

The tool caches LLM results per input hash and batches calls where feasible. Because LLM calls send local code to an external service, the tool makes this explicit in its UI so reviewers can make an informed choice for sensitive codebases.

## 16. Deferred / Future

Explicitly out of v1:

- Collaboration and any cross-reviewer visibility
- Languages beyond JS/TS (architecture supports; implementations deferred)
- Deep git history analysis
- Rebase-safe approval range migration
- Remote/hosted mode
- Native rule plugin interface beyond shell commands
- Export of review results (to PR comments, markdown reports, etc.) — flagged as a possible early addition if demand emerges

## 17. Open Questions

Items parked for decision during or after implementation:

- Similarity threshold for function-rename detection heuristic
- Default path-materialization depth limit
- Whether "completeness" has any meaningful system-level threshold or stays fully reviewer-defined
- How much prep is "enough" before walkthroughs are worthwhile — needs UX feedback
- Priority ordering for framework sub-adapter support beyond the most common JS/TS frameworks
- Whether review-result export is v1 or deferred
- Whether the path-context model (§8.4) should remain "global default, reuse surfaced" or shift to enforced path-scoping for specific classifications (e.g., route handlers) — currently decided as global default; revisit if reuse-in-wrong-context bugs slip through review in practice

## 18. Cross-Reference Summary

Quick map of where features interact (for fast orientation):

- **Classifications** (§5.2) drive **checklists** (§9.1), which are extended by **rules** (§9.2) scoped per §9.3. The optional Stage 0 architectural pass (§5.2) seeds classification with project-level priors.
- **Path detection** (§5.3) produces the input to **guided walkthroughs** (§7.1), which use **dig-into navigation** (§7.2) for depth. **Path ordering** (§7.1.1) determines what the reviewer sees first.
- **Entry points and preamble** (§5.4) determine walkthrough start points and context panels (§7.1).
- **Review actions** (§8.1) and **free-form comments** (§8.2) are distinct: actions set status, comments annotate. **Cascade rules** (§8.3) handle file/function interaction. **Path-context** (§8.4) defaults to global approval with reuse surfaced on re-encounter rather than enforced re-review.
- **Reviewed-function reuse** (§7.2) and **path-context awareness** (§8.4) share the same mechanism: visibility of prior reviews with Skip / Re-examine, not mandatory re-review.
- **Progress tracking** (§10) distinguishes four node states including "reviewed but stale" per §11.1.
- **Re-analysis** (§11) preserves review history across **function changes** (§11.1, which revert status to pending), **function renames** (§11.2), and, with git, **file renames** (§11.3).
- **"New code" comparison** (§11.4) is the same feature set as normal walkthrough, with new-vs-context markers overlaid; this is what makes PR review and AI-code review the same flow with different inputs.
- **LLM usage** (§15) is opt-in and layered on top of deterministic analysis — disabling it degrades quality (no Stage 0 pass, no Stage 2 classification, no LLM path inference, no path categorization, no LLM rules) but does not break any core feature.
