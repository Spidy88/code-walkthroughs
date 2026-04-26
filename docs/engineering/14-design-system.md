# 14 — Design System

## Scope

The implementation contract for the **Blueprint Draft** visual language confirmed in `/docs/design/spec.md`. Defines design tokens and their Tailwind mapping, primitive components specific to the drafting metaphor (corner ticks, drafting labels, semantic chips), canvas-specialized components for xyflow surfaces, and the conventions that keep the visual language coherent without the AI inventing variations.

## Out of scope

Sitemap, flows, or screen-level decisions (live in `/docs/design/spec.md`). Per-page layouts (delivered as designs land). Frontend tech stack and routing (see `12-frontend.md`). Component implementations (live in `apps/web/src/components/`).

## Blueprint Draft — the visual language

**Blueprint Draft** is the confirmed visual direction (see `/docs/design/spec.md` §3). The interface borrows the language of technical drafting — figure callouts, leader lines, hairline rules, revision stamps. This is not decoration; it is conceptual fit. The substrate of this tool *is* a graph (call graph, AST), and the primary review surface (`/docs/design/spec.md` §4) is literally a drafting drawing.

### Defining properties

- **Dot-grid background** at 8px spacing, very low contrast (~18% opacity primary blue dots on `paper-50`).
- **Hairline rules at 1px.** No 2px+ borders for layout dividers; the precision is the look.
- **Corner ticks** on key panels — small 10×10 L-shaped marks at each corner, primary-blue, 1px stroke. Used on the code panel, checklist panel, and any "primary surface" the reviewer is meant to focus on.
- **Sharp corners.** Border radius is `0` for everything except indicator dots/pills (which are circular).
- **Drafting labels.** Section callouts like `FIG. A`, `§ 01`, `A.1`, `01 / 12`, `REV`, `SHEET` in monospace, uppercase, wide letter-spacing. Used as wayfinding and to give structural elements an annotated feel.
- **Leader lines.** Dashed 1px borders separate annotations from the thing they annotate (e.g., signature row from code body, dashed strong-weight separator).
- **Color reserved for semantic signal.** Approve / reject / info / new / modified / stale / warn — these are the only places color carries meaning. Decoration is grayscale.

### What this is *not*

- Not "skeumorphic." We borrow the *language* of drafting (figure callouts, dimension lines, revision stamps), not the texture. No paper textures, no pencil shading, no fake aging.
- Not minimal-by-restraint. There is detail, but it is **functional detail** — annotations, sections, callouts.
- Not flashy. Motion is short (80–220ms), semantic only (state changes), and never decorative.

### Tradeoffs we accept

- **The metaphor is committed.** Reviewers who want a transparent, generic web app will find this opinionated. We're not undecided about it.
- **Crisp borders matter.** On low-DPI displays the hairlines lose some refinement. We lean into 1px logical borders and do not try to compensate with fake "1.5px" hacks.
- **Density is high.** Information per screen is more than a typical SaaS dashboard. That is correct for a code review surface; the user is reading code, not browsing a marketing site.

## Design tokens

The starting palette derives from `/docs/design/raw/style.json` and is confirmed as the v1 baseline (`/docs/design/spec.md` §3). Tokens may evolve as visual designs land for new surfaces (especially the canvas and the comparison-mode surfaces); changes go through this doc and `tokens.css` together.

The implementation copy is **`apps/web/src/styles/tokens.css`** as CSS custom properties, mapped to Tailwind v4's `@theme` directive. Tokens are the source of truth for color, spacing, typography, and motion. **No hex codes in components. No magic numbers in spacing. No font-family declarations outside tokens.**

### Color

Colors come in two layers:

- **Primitive** — named by hue and weight (`paper-50`, `primary-600`, `approve-500`). These define the palette.
- **Semantic** — named by role (`background`, `text-primary`, `border`, `success`, `warning`). Components reference these, not primitives.

| Semantic | Primitive | Used for |
|---|---|---|
| `background` | `paper-50` (`#f5f8fb`) | Page background (with dot-grid overlay) |
| `surface` | `#ffffff` | Panels, cards, modals |
| `surface-sunken` | `paper-100` (`#eaeff6`) | Path breadcrumbs, dig-into footers, sub-headers |
| `border` | `paper-200` (`#c4cfde`) | Default 1px hairlines |
| `border-strong` | `paper-400` (`#7688a4`) | Panel outlines, focus states |
| `text-primary` | `paper-900` (`#0e131d`) | Body and code |
| `text-secondary` | `paper-600` (`#3c4a60`) | Sub-headings, reduced emphasis |
| `text-tertiary` | `paper-500` (`#556680`) | Drafting labels, captions |
| `primary` | `primary-600` (`#0a5a80`) | Brand accent, primary buttons, links |
| `primary-hover` | `primary-700` | Hover states for primary |
| `success` | `approve-600` (`#1e5c38`) | Approve color — solid in primary action |
| `error` | `reject-600` (`#a62d40`) | Reject color |
| `warning` | `warn-600` (`#8c5400`) | Warn / modified state |

**Semantic state colors** (the entire reason color exists in this design):

| State | Color | Soft background |
|---|---|---|
| Approved / new (positive change) | `approve-500` (`#2a7a4b`) / `approve-600` | `#e3efe7` |
| Rejected / deleted | `reject-500` (`#c93f54`) / `reject-600` | `#f4e3e5` |
| Info-requested | `info-500` (`#0a5a80`) / `info-600` | `#dde9f0` |
| Modified | `modified-500` (`#b56e00`) | `#f3ead5` |
| Stale | `stale-500` (`#7a4a9a`) | `#eee2f2` |
| Never reviewed | `text-tertiary` | `surface-sunken` |
| Contract change (comparison) | `accent-600` (`#a62d40`) | `#f4e3e5` |
| Indirect impact (comparison) | `warn-500` (`#b56e00`) | `#f3ead5` |
| Cosmetic (comparison, low signal) | `text-tertiary` | `surface-sunken` |

The last three are extensions of the original palette specifically for comparison mode (Layer 1 / Layer 3 / cosmetic-bucket). They reuse existing primitives so we don't introduce new hues.

### Typography

| Family | Use |
|---|---|
| Inter | Body, headings, UI labels |
| IBM Plex Mono | Code, drafting labels (`FIG. A`, `§ 01`), file paths, identifiers, status chips |

Scale (base 15px, ratio 1.2):

| Token | px | Usage |
|---|---|---|
| `xs` | 11 | Drafting labels, captions, chip text |
| `sm` | 13 | Code, small UI |
| `base` | 15 | Body |
| `lg` | 17 | Sub-headings |
| `xl` | 21 | Section headings |
| `2xl` | 25 | Page titles |
| `3xl` | 30 | Hero |
| `4xl` | 36 | Reserved; rarely used |

Letter spacing for drafting labels: `0.14em` to `0.18em`, uppercase. This is non-negotiable for the figure callouts and chip vocabulary — it's what makes them read as "annotations" rather than "labels."

### Spacing

Base unit `4px`. The full scale: `0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128`.

The 4px grid is rigid. **Do not introduce `5px`, `7px`, `10px`** or any value not in the scale. If a layout needs an off-grid spacer, the design is wrong, not the grid.

### Borders

| Token | Value |
|---|---|
| `radius.*` | `0px` (everything except `radius.full = 9999px`) |
| `width.default` | `1px` |
| `width.thick` | `2px` (used very rarely; primary action button outlines, panel outlines on focus) |

### Shadows

Almost no shadows. Where elevation is needed, a **second 1px ring in primary at low opacity** is preferred over a soft shadow:

```
shadow-lg: 0 0 0 1px rgba(10, 90, 128, 0.12);
shadow-xl: 0 0 0 1px rgba(10, 90, 128, 0.20), 0 8px 24px rgba(14, 19, 29, 0.06);
```

`shadow-xl` is the only place a soft drop shadow appears, and only on modals/popovers. Cards do not have shadows.

### Motion

| Token | Value | Use |
|---|---|---|
| `fast` | 80ms | Hover, focus rings |
| `normal` | 140ms | Most state transitions |
| `slow` | 220ms | Modal/popover open/close |
| `slower` | 320ms | Reserved; rarely used |

Default easing: `cubic-bezier(0.3, 0, 0.2, 1)`. No bouncy motion in this design system except for celebratory moments (none in v1).

## Tailwind mapping

`apps/web/src/styles/tokens.css` defines the CSS custom properties; `@theme` in the same file maps them into Tailwind:

```css
@import "tailwindcss";

@theme {
  --color-background: #f5f8fb;
  --color-surface: #ffffff;
  --color-surface-sunken: #eaeff6;
  --color-border: #c4cfde;
  --color-border-strong: #7688a4;
  --color-text-primary: #0e131d;
  --color-text-secondary: #3c4a60;
  --color-text-tertiary: #556680;
  --color-primary: #0a5a80;
  --color-primary-hover: #074560;
  --color-success: #1e5c38;
  --color-error: #a62d40;
  --color-warning: #8c5400;

  --color-state-new: #2a7a4b;
  --color-state-modified: #b56e00;
  --color-state-stale: #7a4a9a;
  --color-state-contract: #a62d40;
  --color-state-indirect: #b56e00;

  --font-sans: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace;

  --radius-none: 0;
  --radius-full: 9999px;

  --tracking-wide: 0.05em;
  --tracking-wider: 0.14em;
  --tracking-widest: 0.18em;
}
```

This means components write `text-text-primary`, `bg-surface`, `border-border-strong`, `font-mono`, `tracking-widest`, etc. — not raw hex values.

## Component patterns specific to Blueprint Draft

Beyond shadcn primitives, this design system has its own set of component patterns. They live in `apps/web/src/components/blueprint/`.

### `<DraftingLabel>`

The uppercase, wide-tracked monospace label used everywhere as wayfinding.

```tsx
<DraftingLabel size="sm">FIG. A · CHECKLIST · ROUTE_HANDLER</DraftingLabel>
<DraftingLabel size="xs">§ 01 · INTENT</DraftingLabel>
```

- Always uppercase (the component enforces it; consumers pass mixed case).
- Always `font-mono`, weight 600 or 700.
- Always `tracking-widest` (`0.18em`) at sm, `tracking-wider` (`0.14em`) at xs.
- Color: `text-tertiary` by default; `primary` for emphasis.

### `<CornerTick>`

The 10×10 L-shaped corner mark on primary-surface panels.

```tsx
<Panel>
  <CornerTick position="tl" />
  <CornerTick position="tr" />
  <CornerTick position="bl" />
  <CornerTick position="br" />
  {/* panel content */}
</Panel>
```

- 1px stroke, primary color.
- Renders four ticks per panel; the `<Panel>` wrapper handles all four with a single boolean prop (`<Panel ticks>`).
- Used on: code panel, checklist panel, comparison Risks panel, contract-change detail panel.
- **Not used on**: nested cards, list rows, modal content, inputs.

### `<Chip>`

The semantic state chip with optional dot indicator.

```tsx
<Chip variant="approved">APPROVED</Chip>
<Chip variant="modified">MODIFIED</Chip>
<Chip variant="contract-change">CONTRACT CHANGE</Chip>
<Chip variant="never-reviewed" hideDot>NEVER REVIEWED</Chip>
```

- Inline-flex, 1px border, 0 radius, `font-mono`, weight 600, `tracking-widest`, uppercase.
- Variant determines color + soft background. The mapping is in `chip-variants.ts`.
- Default has a 6×6 solid square dot in the foreground color; `hideDot` for neutral states like "never reviewed."

The full variant list (must stay in sync with the semantic-state table above): `approved`, `rejected`, `info-requested`, `new`, `modified`, `stale`, `never-reviewed`, `contract-change`, `indirect-impact`, `cosmetic`, `route-handler`, `service`, `client`, `repository`, `helper`, `middleware`, `component`, `page`, `hook`, `config`, `script`, `seed`, `fixture`, `test`, `type-only`, `unclassified`. Classification chips share the visual structure but use `paper-*` neutrals — they're labels, not state signals.

### `<Panel>`

The primary surface wrapper. White background, 1px border-strong outline, optional corner ticks.

```tsx
<Panel ticks>
  <PanelHeader>
    <DraftingLabel>FIG. A</DraftingLabel>
    <Chip variant="route-handler">ROUTE_HANDLER</Chip>
  </PanelHeader>
  <PanelBody>{/* code */}</PanelBody>
  <PanelFooter>{/* dig-into */}</PanelFooter>
</Panel>
```

- Header: 1px border-bottom, sunken background optional.
- Footer: 1px border-top, sunken background by default (the dig-into row pattern).
- Body: padded by default; `<Panel.Body padless>` for code displays where the inner element handles its own padding.

### `<TitleBlock>`

The drafting-table title bar at the top of the app shell — `DRAWING · STYLE_DIRECTION_03`, project name, branch/ref, page indicator (sheet 01/12).

```tsx
<TitleBlock
  drawingLabel="WALKTHROUGH"
  project="acme-api"
  rev="feat/checkout-v2"
  sheet={{ current: 3, total: 12 }}
/>
```

- Replaces a generic top navigation bar.
- The `sheet` indicator doubles as a coverage hint when on the project overview ("nodes reviewed / total").

### `<LineGutter>`

The 3-column code line layout (state strip · line number · code) used in walkthrough nodes.

```tsx
<LineGutter
  lineNumber={142}
  state="modified"
>
  const { items, paymentMethod } = req.body
</LineGutter>
```

- 2px state strip in the foreground color of the line state (`new`, `modified`, `removed`, `unchanged`).
- 44px line-number column, mono, right-aligned, `text-tertiary`.
- Code column with horizontal scroll for long lines.
- Background: light tint of state color (`approveSoft`, `warnSoft`, etc.) for `new`/`modified`/`removed` lines; transparent for `unchanged`.

### `<PathBreadcrumb>`

The monospace breadcrumb used at the top of canvas-related views — `routes/purchase.ts → handlePurchase → billing.charge`.

```tsx
<PathBreadcrumb>
  <PathBreadcrumb.Segment>routes/purchase.ts</PathBreadcrumb.Segment>
  <PathBreadcrumb.Segment>handlePurchase</PathBreadcrumb.Segment>
  <PathBreadcrumb.Segment current>billing.charge</PathBreadcrumb.Segment>
</PathBreadcrumb>
```

- Sunken background, 1px border-bottom.
- Arrows are colored `primary`. Last segment is bold + `text-primary`. Others are `text-secondary`.
- Mono throughout.

## Tier-2 components — canvas surfaces

The walkthrough and per-path comparison are rendered on infinite canvases (`/docs/design/spec.md` §4) using `@xyflow/react`. The canvas-specialized components below wrap xyflow's node and edge interfaces with the Blueprint primitives so the canvas reads as a drafting drawing, not a generic flowchart.

### `<CanvasNode>`

A custom xyflow node type wrapping `<Panel>`. The walkthrough's atomic unit on the canvas.

```tsx
<CanvasNode
  variant="code"      // 'code' | 'summary' | 'preamble' | 'dispatcher'
  focused              // current focus on the canvas
  classification="route_handler"
  status="reviewed_current"
  // ...node body content
/>
```

- **`code`** variant: full code panel with classification chip, body (or signature + first ~10 lines + click-to-expand), checklist preview, dig-into footer. Used for nodes the reviewer is actively reading.
- **`summary`** variant: collapsed — signature + chips + status indicator. Used for path nodes that are not currently focused.
- **`preamble`** variant: de-emphasized; for environmental preamble shown as context.
- **`dispatcher`** variant: smaller, stylized — for routers / switches that select among entry points.
- Focus state: `focused` prop adds the four `<CornerTick>`s, lifts the panel slightly, and adds a 2px focus ring in `primary`.
- All variants are full xyflow nodes (selectable, draggable disabled by default — layout is computed).

### `<CanvasEdge>`

A custom xyflow edge type with leader-line styling.

```tsx
<CanvasEdge
  variant="resolved"   // 'resolved' | 'unresolved' | 'handler-attached' | 'comparison-matched' | 'dig-into-active'
  label="line 142"      // optional call-site annotation
/>
```

- **`resolved`**: solid 1px `primary` stroke. Default for known callees.
- **`unresolved`**: dashed 1px `text-tertiary` stroke. Used when the analyzer couldn't resolve the callee (cross-file-or-external, indirect).
- **`handler-attached`**: dotted 1px `primary` stroke. Used for framework-style edges where a handler attaches to a route method.
- **`comparison-matched`**: faint 1px `border` stroke. Connects matched node positions between paired canvases in comparison mode.
- **`dig-into-active`**: 2px `primary` stroke with a subtle pulse. Highlights the currently-active dig-into chain.
- Labels are rendered with `<DraftingLabel size="xs">` styling.

### `<CanvasMinimap>`

An orientation aid for large paths. Uses xyflow's `<MiniMap>` with a custom `nodeColor` callback that maps classification → token color.

```tsx
<CanvasMinimap
  position="bottom-right"
  nodeStrokeColor="border-strong"
/>
```

- 1px border, `surface` background, no shadow.
- Always visible when path has > 8 nodes; collapsible otherwise.

### `<CanvasControls>`

Pan / zoom / fit-to-view / reset. Wraps xyflow's `<Controls>` with Blueprint button styling — sharp corners, hairline borders.

### `<PairedCanvas>`

Two `<Canvas>` instances side by side for path-delta comparison. A shared minimap (per `/docs/design/spec.md` §8 Open Questions, default to one shared) and synchronized pan/zoom.

```tsx
<PairedCanvas
  base={<Canvas nodes={baseNodes} edges={baseEdges} />}
  head={<Canvas nodes={headNodes} edges={headEdges} />}
  matchedPositions={pairs}
/>
```

- The `matchedPositions` prop drives faint `comparison-matched` edges across the gap between the two canvases.
- Position diff annotations (added / removed / replaced / body_changed) render as chip overlays on head-side nodes.

### Layout contract

- Canvas layout is **deterministic and computed**, never hand-positioned. We use `dagre` for v1 with `rankdir: 'LR'` for horizontal trees.
- Node positions are recomputed on data changes; xyflow's controlled-positions API is used so the layout pass is side-effect-free.
- For dense graphs where `dagre` produces awkward layouts, we may switch to `elkjs`. The contract — "deterministic, computed, no manual positioning" — does not change.

## Component conventions (Blueprint-specific extension of `12-frontend.md`)

In addition to the conventions in `12-frontend.md`:

- **Borders are explicit.** Components must declare `border` themselves; no global "card" style adds borders implicitly.
- **The 4px grid is rigid.** All spacing uses Tailwind's spacing scale (which we map to the design's scale). No arbitrary `[7px]`, `[13px]` values.
- **Color is variant, never inline.** A component never takes a `color` prop with a hex value. It takes a variant that resolves to a token.
- **Mono is intentional.** Use the `font-mono` class only for: code, file paths, identifiers, drafting labels, line numbers, technical metadata. Not for body text or button labels.

## Storybook

Every component has stories in three categories:

1. **Default** — the canonical use.
2. **Variants** — every variant the component supports.
3. **Edge** — long content, missing data, focused/disabled states, the LLM-disabled fallback (where applicable).

Stories are organized to mirror the `components/` tree:

```
apps/web/src/components/
├── blueprint/
│   ├── chip/
│   │   ├── Chip.tsx
│   │   ├── Chip.stories.tsx
│   │   └── chip-variants.ts
│   ├── corner-tick/
│   ├── drafting-label/
│   ├── panel/
│   ├── title-block/
│   ├── line-gutter/
│   ├── path-breadcrumb/
│   └── canvas/
│       ├── CanvasNode.tsx
│       ├── CanvasNode.stories.tsx
│       ├── CanvasEdge.tsx
│       ├── PairedCanvas.tsx
│       └── ...
├── ui/                  # shadcn-wrapped primitives
└── code/
```

Each story file colocates with the component. Storybook autodiscovers `*.stories.tsx`.

### Canvas storybook caveat

xyflow components require a layout context (`<ReactFlowProvider>`) and a sized container. Stories for `<CanvasNode>` and `<CanvasEdge>` use a `withCanvasContext` decorator (in `apps/web/src/storybook/decorators/`) that provides both. This is in `/docs/engineering/12-frontend.md`'s "Open items" — we evaluate during implementation whether decorator-based stories are sufficient or whether canvas verification leans on Playwright instead.

## Accessibility within the drafting metaphor

The hairline aesthetic creates real accessibility risks. We address them deliberately:

- **Focus rings are 2px**, not 1px, in `primary` with a 2px offset. They override the hairline aesthetic on purpose — focus must be unmistakable.
- **Hover states use background fill**, not border thickening. A 1px → 2px border change shifts layout; a fill change does not.
- **Color is never the only signal.** State chips always pair color with text (`APPROVED`) and most also include a shape (the solid square dot). Status indicators in lists pair color with an icon or letter.
- **Contrast targets**: text on `surface` (white) hits WCAG AA at 4.5:1 for `text-primary`. `text-tertiary` (`#556680`) on `surface` is at 4.78:1 — also AA. Soft backgrounds (`approveSoft`, `warnSoft`, etc.) maintain AA against their foreground color. We test new color combinations against an AA checker before adding them.
- **Reduced-motion**: `prefers-reduced-motion` collapses all transitions to 0ms. The `--motion-*` tokens read from a CSS custom property that flips on the media query.

## Density and code displays

Code is the primary content. Code displays:

- Use `font-mono` at `13px` (`sm`).
- Have line height `1.55` (the `code` line-height token).
- Use a single default theme. No theme picker in v1.
- Show line numbers in the gutter at `xs` (`11px`), `text-tertiary`, right-aligned.
- Highlight changed lines via a 2px state strip in the gutter and a soft state background — never via text color changes.
- Do not animate scrolling or line-highlight transitions. Code must feel like it's printed on the page.

## Implementation order

The components must land in this dependency order so that downstream features can compose them:

1. **Tokens** (`tokens.css` + `@theme` block) and the typography setup (`@font-face` for Inter + IBM Plex Mono).
2. **Tier-0 primitives**: `<DraftingLabel>`, `<Chip>`, `<CornerTick>`. Pure, no dependencies.
3. **Tier-1 surfaces**: `<Panel>` (uses `<CornerTick>`), `<TitleBlock>` (uses `<DraftingLabel>`), `<PathBreadcrumb>`, `<LineGutter>`.
4. **Tier-2 canvas**: `<CanvasNode>` (uses `<Panel>`), `<CanvasEdge>`, `<CanvasMinimap>`, `<CanvasControls>`, `<PairedCanvas>`. Built on `@xyflow/react` and `dagre`.
5. **Feature components** (built on top): walkthrough canvas, checklist panel, contract-change panel, comparison surfaces.

Each tier ships with its Storybook stories (or a Playwright equivalent for canvas surfaces) before the next tier starts. A feature component that wants a Tier-1 or Tier-2 component that doesn't exist yet **must** add it to its tier first, with stories, rather than reinventing it locally.

## What this doc does *not* spec

- **Sitemap, flows, and screen-level decisions** — see `/docs/design/spec.md`.
- **Per-page layouts** — produced as designs land.
- **Behavior of components** — see `12-frontend.md` for state ownership, data fetching, and behavior conventions.
- **Specific shadcn customizations** — added inline next to each `ui/*` wrapper, not centralized here.
