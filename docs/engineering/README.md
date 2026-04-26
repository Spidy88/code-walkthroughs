# Engineering Documentation — Code Walkthroughs

This directory is the source of truth for **how** Code Walkthroughs is built. It sits alongside two other authoritative docs:

- **Product spec** (`/code-walkthrough-tool-spec.md`) — *what* we're building. Authoritative on behavior and scope.
- **Design spec** (`/docs/design/spec.md`) — *what it looks and feels like*, sitemap, user flows, surface model.

When these documents conflict:
- Product behavior questions: product spec wins.
- Visual / surface / flow questions: design spec wins.
- Implementation mechanics: these engineering docs win.

A change to one that affects another must update both in the same PR.

## Who this is for

- Engineers (human or AI) writing code in this repo.
- Reviewers deciding whether a change is consistent with the project's intent.

Every document here is written to be opened cold. You should not need to read them in order to understand one of them.

## How to use this doc set

- **Starting a new task?** Read `01-architecture.md` for the system shape, then open the numbered file closest to what you're changing.
- **Adding a new pipeline, rule tier, or adapter?** `03-conventions.md` defines the patterns. `05-analysis-pipeline.md`, `06-llm-integration.md`, and `11-development-workflow.md` cover the extension points.
- **Reviewing a change?** Skim `03-conventions.md` and the file(s) owning the area being changed. Flag any drift.
- **Onboarding Claude on a specific task?** Point it at the relevant numbered doc plus `03-conventions.md`. Each doc is self-contained.

## Table of contents

| File | Scope |
|------|-------|
| [01-architecture.md](./01-architecture.md) | System overview, process model, data flow, boundaries |
| [02-project-structure.md](./02-project-structure.md) | Monorepo layout, package boundaries, file organization |
| [03-conventions.md](./03-conventions.md) | TS style, error handling, logging, naming, commenting, how to extend |
| [04-persistence.md](./04-persistence.md) | SQLite schema, Drizzle patterns, migrations, per-codebase isolation |
| [05-analysis-pipeline.md](./05-analysis-pipeline.md) | Ingestion, parsing, classification, path detection, preamble |
| [06-llm-integration.md](./06-llm-integration.md) | Claude client, prompt cache, per-pipeline prompts, degradation contract |
| [07-api-surface.md](./07-api-surface.md) | tRPC router layout, procedure conventions, active-codebase context |
| [08-review-state.md](./08-review-state.md) | Node status state machine, cascade rules, path-context scoping |
| [09-reanalysis.md](./09-reanalysis.md) | Diffing, rename detection, stale-status transitions, comparison-ref handling |
| [10-testing.md](./10-testing.md) | Vitest, Playwright, Storybook; fixtures; test layout |
| [11-development-workflow.md](./11-development-workflow.md) | Scripts, dev loop, debugging, how to add an adapter/rule/classification |
| [12-frontend.md](./12-frontend.md) | Frontend architecture (stub — fleshed out after designs land) |
| [13-comparison-flows.md](./13-comparison-flows.md) | Two-commit comparison: Risks, Path Deltas, Indirect Impact; signature diff and alignment |
| [14-design-system.md](./14-design-system.md) | Blueprint Draft visual language, design tokens, component patterns, Storybook conventions |

## Keeping this doc set accurate

These docs are load-bearing for AI-driven development. If an implementation drifts from what's documented here, either fix the implementation or update the doc — **do not leave both in place**. PRs that change behavior must also update the relevant doc in the same change.

Per-file conventions:
- Each numbered doc starts with a one-paragraph "Scope" section and a short "Out of scope" section so readers can confirm they're in the right place before reading further.
- Code blocks in these docs are normative unless marked "illustrative."
- External references (libraries, APIs) use stable links; if a link rots, replace it with the authoritative current source.
