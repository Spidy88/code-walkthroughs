# Design

This directory holds the design specification and the draft outputs that informed it.

## Layout

```
docs/design/
├── README.md                # This file
├── spec.md                  # Canonical design specification — see below
└── raw/                     # Draft outputs that informed the spec; reference only
    ├── brief.json
    ├── features.json
    ├── sitemap.json
    ├── style.json
    ├── style-preview.jsx
    └── flows/
        ├── ingest_and_prep.json
        ├── guided_path_walkthrough.json
        ├── dig_into_navigation.json
        ├── file_browser_review.json
        └── new_code_comparison_review.json
```

## What's authoritative

**`spec.md` is the canonical design specification.** It captures the decided state: visual direction, surface model (including the xyflow canvas decision), sitemap, and user flows. When `spec.md` and `raw/` disagree, `spec.md` wins.

**`raw/` is reference, not source-of-truth.** These files were generated as exploratory output during the design discovery phase. Some of their content is reflected in `spec.md` (sitemap concepts, style tokens, flow scripts for walkthrough mode); some is stale (notably the comparison-mode flow and overview screen, which predate the three-layer revision in `/docs/engineering/13-comparison-flows.md`). They're retained because:

- `style.json` is the starting palette — `14-design-system.md` references its tokens.
- The walkthrough / prep / file-browser flow scripts are aligned with `spec.md` and useful as reference reading.
- The brief and features files document the product reasoning that led to current decisions.

## How to use these files

- **Designers**: edits go into `spec.md`. The `raw/` files are not maintained.
- **Engineers**: read `spec.md` first. Cross-reference with `/docs/engineering/14-design-system.md` for tokens and primitives, and `/docs/engineering/12-frontend.md` for routing.
- **AI implementers**: never invent visual variations not represented in `spec.md` or the engineering design-system doc. If a feature seems to need a new component, propose adding it to `14-design-system.md`'s primitive tier first, with stories, then implement.

## Versioning

`spec.md` is checked into git. Substantive changes (new screens, new flows, surface-model shifts) should land with a brief CHANGELOG-style commit message. Detailed visual layouts produced during implementation (Figma exports, screenshots, layout JSONs) belong in their own sub-directory if they need to live in this repo; alternatively, link out to the design tool's own source.
