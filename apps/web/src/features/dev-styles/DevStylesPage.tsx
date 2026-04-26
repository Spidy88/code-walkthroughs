import { useMemo } from 'react';
import {
  Canvas,
  Chip,
  type ChipVariant,
  DraftingLabel,
  LineGutterBlock,
  PairedCanvas,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PathBreadcrumb,
  TitleBlock,
  layoutCanvas,
} from '../../components/blueprint/index.ts';
import {
  FIXTURE_BASE_EDGES,
  FIXTURE_BASE_NODES,
  FIXTURE_EDGES,
  FIXTURE_NODES,
} from '../../dev-fixtures/canvas-fixture.ts';

export function DevStylesPage() {
  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1280px] space-y-8">
        <TitleBlock
          drawingLabel="DRAWING · DEV / STYLES"
          title="Blueprint Draft — Reference"
          tagline="Tokens, primitives, surfaces, canvas. Visual reference for /dev only."
          cells={[
            { label: 'DEV', value: 'local' },
            { label: 'REV', value: 'phase-A' },
            { label: 'SHEET', value: 'reference' },
          ]}
        />
        <PrimitivesShowcase />
        <SurfacesShowcase />
        <KitchenSink />
        <CanvasShowcase />
      </div>
    </main>
  );
}

function PrimitivesShowcase() {
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § C · BLUEPRINT PRIMITIVES (TIER-0)
      </DraftingLabel>

      <ShowcaseCard label="C.1 · DRAFTING LABEL">
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-6">
            <DraftingLabel size="sm" tone="tertiary">
              FIG. A · CHECKLIST
            </DraftingLabel>
            <DraftingLabel size="sm" tone="primary">
              FIG. B · CALL GRAPH
            </DraftingLabel>
            <DraftingLabel size="sm" weight="bold">
              SECTION · 03
            </DraftingLabel>
          </div>
          <div className="flex flex-wrap items-baseline gap-6">
            <DraftingLabel size="xs">A.1</DraftingLabel>
            <DraftingLabel size="xs">REV</DraftingLabel>
            <DraftingLabel size="xs">SHEET 01 / 22</DraftingLabel>
            <DraftingLabel size="xs" tone="primary">
              ACTIVE
            </DraftingLabel>
          </div>
        </div>
      </ShowcaseCard>

      <ShowcaseCard label="C.2 · CHIP — ALL VARIANTS">
        <div className="space-y-3">
          <ChipRow
            variants={['approved', 'rejected', 'info-requested', 'never-reviewed']}
            labels={STATE_LABELS}
          />
          <ChipRow variants={['new', 'modified', 'stale']} labels={STATE_LABELS} />
          <ChipRow
            variants={['contract-change', 'indirect-impact', 'cosmetic']}
            labels={STATE_LABELS}
          />
          <ChipRow
            variants={[
              'route-handler',
              'service',
              'client',
              'repository',
              'helper',
              'middleware',
              'component',
              'page',
              'hook',
              'config',
              'script',
              'seed',
              'fixture',
              'test',
              'type-only',
              'unclassified',
            ]}
            labels={STATE_LABELS}
          />
        </div>
      </ShowcaseCard>
    </section>
  );
}

function SurfacesShowcase() {
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § D · BLUEPRINT SURFACES (TIER-1)
      </DraftingLabel>

      <ShowcaseCard label="D.1 · PANEL — DEFAULT">
        <Panel>
          <PanelHeader>
            <DraftingLabel size="sm">FIG. P · DEFAULT PANEL</DraftingLabel>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-text-secondary">
              Default tone — white surface, hairline border, no corner ticks.
            </p>
          </PanelBody>
        </Panel>
      </ShowcaseCard>

      <ShowcaseCard label="D.2 · PANEL — TICKED + FOOTER">
        <Panel ticks>
          <PanelHeader tone="sunken">
            <DraftingLabel size="sm">FIG. Q · TICKED PANEL</DraftingLabel>
            <Chip variant="route-handler">ROUTE HANDLER</Chip>
            <div className="flex-1" />
            <DraftingLabel size="xs">NODE 03 / 07</DraftingLabel>
          </PanelHeader>
          <PanelBody>
            <p className="text-sm text-text-secondary">
              Focused panels carry corner ticks. Sunken header tone separates the chrome from the
              body. Footer is sunken by default and used for dig-into rows.
            </p>
          </PanelBody>
          <PanelFooter>
            <DraftingLabel size="xs">CALLS →</DraftingLabel>
            <span className="font-mono text-sm font-semibold text-text-primary">
              billing.charge()
            </span>
          </PanelFooter>
        </Panel>
      </ShowcaseCard>

      <ShowcaseCard label="D.3 · TITLE BLOCK">
        <TitleBlock
          drawingLabel="DRAWING · WALKTHROUGH"
          title="acme-api"
          tagline="POST /api/checkout"
          cells={[
            { label: 'PROJECT', value: 'acme-api' },
            { label: 'REV', value: 'feat/checkout-v2' },
            { label: 'SHEET', value: '03 / 12' },
          ]}
        />
      </ShowcaseCard>

      <ShowcaseCard label="D.4 · PATH BREADCRUMB">
        <Panel>
          <PathBreadcrumb leadingLabel="PATH">
            <PathBreadcrumb.Segment>routes/purchase.ts</PathBreadcrumb.Segment>
            <PathBreadcrumb.Segment>handlePurchase</PathBreadcrumb.Segment>
            <PathBreadcrumb.Segment current>billing.charge</PathBreadcrumb.Segment>
          </PathBreadcrumb>
          <PanelBody>
            <p className="text-sm text-text-secondary">
              Used at the top of canvas-related views to anchor the reviewer's location along the
              active path.
            </p>
          </PanelBody>
        </Panel>
      </ShowcaseCard>

      <ShowcaseCard label="D.5 · LINE GUTTER">
        <Panel>
          <LineGutterBlock
            lines={[
              { number: 142, text: 'export async function handlePurchase(req, res) {' },
              { number: 143, text: '  const user = await authenticate(req)' },
              { number: 144, text: '  if (!user) return res.status(401).send()' },
              { number: 145, text: '' },
              {
                number: 146,
                text: '  const { items, paymentMethod } = req.body',
                state: 'modified',
              },
              { number: 147, text: '  const validated = validateOrder(items)', state: 'modified' },
              { number: 148, text: '' },
              { number: 149, text: '  const charge = await billing.charge({', state: 'new' },
              { number: 150, text: '    userId: user.id,', state: 'new' },
              { number: 151, text: '    amount: validated.total,', state: 'new' },
              { number: 152, text: '    method: paymentMethod,', state: 'new' },
              { number: 153, text: '  })', state: 'new' },
              { number: 154, text: '' },
              {
                number: 155,
                text: '  await orders.create({ userId: user.id, charge })',
              },
              { number: 156, text: '  return res.status(200).json({ ok: true })' },
              { number: 157, text: '}' },
            ]}
          />
        </Panel>
      </ShowcaseCard>
    </section>
  );
}

function KitchenSink() {
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § E · KITCHEN SINK — WALKTHROUGH NODE COMPOSED
      </DraftingLabel>
      <p className="mb-3 text-sm text-text-secondary">
        Composed from Tier-0 + Tier-1 primitives. Approximates the focused-node shape from the
        original style preview to validate visual fidelity.
      </p>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Panel ticks>
          <PanelHeader tone="sunken">
            <DraftingLabel size="xs">FIG. A ·</DraftingLabel>
            <Chip variant="route-handler">ROUTE HANDLER</Chip>
            <Chip variant="modified">MODIFIED</Chip>
            <Chip variant="new">NEW CALLS</Chip>
            <div className="flex-1" />
            <DraftingLabel size="xs">NODE 03 / 07</DraftingLabel>
          </PanelHeader>
          <PathBreadcrumb leadingLabel="PATH">
            <PathBreadcrumb.Segment>routes/purchase.ts</PathBreadcrumb.Segment>
            <PathBreadcrumb.Segment>handlePurchase</PathBreadcrumb.Segment>
            <PathBreadcrumb.Segment current>billing.charge</PathBreadcrumb.Segment>
          </PathBreadcrumb>
          <PanelBody>
            <div className="flex items-baseline gap-3">
              <DraftingLabel size="xs">A.1</DraftingLabel>
              <div>
                <div className="font-mono text-xs text-text-tertiary">src/routes/purchase.ts</div>
                <div className="font-mono text-base font-semibold text-text-primary">
                  handlePurchase(req, res)
                </div>
              </div>
            </div>
          </PanelBody>
          <div className="border-t border-dashed border-border-strong">
            <LineGutterBlock
              lines={[
                { number: 142, text: 'export async function handlePurchase(req, res) {' },
                { number: 143, text: '  const user = await authenticate(req)' },
                { number: 144, text: '  if (!user) return res.status(401).send()' },
                { number: 145, text: '' },
                {
                  number: 146,
                  text: '  const { items, paymentMethod } = req.body',
                  state: 'modified',
                },
                {
                  number: 147,
                  text: '  const validated = validateOrder(items)',
                  state: 'modified',
                },
                { number: 148, text: '' },
                { number: 149, text: '  const charge = await billing.charge({', state: 'new' },
                { number: 150, text: '    userId: user.id,', state: 'new' },
                { number: 151, text: '    amount: validated.total,', state: 'new' },
                { number: 152, text: '    method: paymentMethod,', state: 'new' },
                { number: 153, text: '  })', state: 'new' },
                { number: 154, text: '' },
                {
                  number: 155,
                  text: '  await orders.create({ userId: user.id, charge })',
                },
                { number: 156, text: '  return res.status(200).json({ ok: true })' },
                { number: 157, text: '}' },
              ]}
            />
          </div>
          <PanelFooter>
            <DraftingLabel size="xs">CALLS →</DraftingLabel>
            <span className="font-mono text-sm font-semibold text-text-primary">
              billing.charge()
            </span>
          </PanelFooter>
        </Panel>
        <Panel ticks>
          <PanelHeader tone="sunken">
            <DraftingLabel size="sm">FIG. B · CHECKLIST · ROUTE_HANDLER</DraftingLabel>
          </PanelHeader>
          <PanelBody>
            <ul className="divide-y divide-dashed divide-border">
              <ChecklistItem label="Authenticates request" status="pass" />
              <ChecklistItem label="Validates input schema" status="pass" />
              <ChecklistItem label="Handles errors consistently" status="fail" />
              <ChecklistItem label="Response shape matches contract" status="skip" />
            </ul>
          </PanelBody>
        </Panel>
      </div>
    </section>
  );
}

function CanvasShowcase() {
  const layout = useMemo(() => layoutCanvas(FIXTURE_NODES, FIXTURE_EDGES), []);
  const baseLayout = useMemo(() => layoutCanvas(FIXTURE_BASE_NODES, FIXTURE_BASE_EDGES), []);

  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § F · CANVAS (TIER-2)
      </DraftingLabel>
      <p className="mb-3 text-sm text-text-secondary">
        Walkthroughs render on an infinite canvas (xyflow + dagre) as a horizontal tree of
        call-graph nodes. Below: a fixture path with mixed variants (dispatcher, preamble, focused
        code node, summaries) and edge styles (resolved, dashed unresolved, dotted handler-attached,
        dig-into-active).
      </p>
      <ShowcaseCard label="F.1 · WALKTHROUGH CANVAS — fixture path">
        <Canvas nodes={layout.nodes} edges={layout.edges} height={520} />
      </ShowcaseCard>
      <ShowcaseCard label="F.2 · PAIRED CANVAS — comparison mode (base vs head)">
        <PairedCanvas
          baseLabel="BASE · main"
          headLabel="HEAD · feat/checkout-v2"
          base={{ nodes: baseLayout.nodes, edges: baseLayout.edges }}
          head={{ nodes: layout.nodes, edges: layout.edges }}
          height={420}
        />
      </ShowcaseCard>
    </section>
  );
}

function ChecklistItem(props: { label: string; status: 'pass' | 'fail' | 'skip' }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-sm">
      <span
        aria-hidden="true"
        className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center text-[10px] font-bold text-text-inverse"
        style={{
          background:
            props.status === 'pass'
              ? 'var(--color-approve-600)'
              : props.status === 'fail'
                ? 'var(--color-reject-600)'
                : 'transparent',
          border:
            props.status === 'skip'
              ? '1px dashed var(--color-border-strong)'
              : `1px solid ${
                  props.status === 'pass' ? 'var(--color-approve-600)' : 'var(--color-reject-600)'
                }`,
        }}
      >
        {props.status === 'pass' ? '✓' : props.status === 'fail' ? '✕' : ''}
      </span>
      <span className="flex-1 text-text-primary">{props.label}</span>
      <DraftingLabel size="xs">{props.status.toUpperCase()}</DraftingLabel>
    </li>
  );
}

function ShowcaseCard(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 border border-border-strong bg-surface p-4">
      <DraftingLabel size="sm" weight="bold" className="block border-b border-border pb-1.5">
        {props.label}
      </DraftingLabel>
      <div className="mt-3">{props.children}</div>
    </div>
  );
}

function ChipRow(props: {
  variants: ReadonlyArray<ChipVariant>;
  labels: Partial<Record<ChipVariant, string>>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {props.variants.map((variant) => (
        <Chip key={variant} variant={variant}>
          {props.labels[variant] ?? variant.toUpperCase()}
        </Chip>
      ))}
    </div>
  );
}

const STATE_LABELS: Partial<Record<ChipVariant, string>> = {
  approved: 'APPROVED',
  rejected: 'REJECTED',
  'info-requested': 'INFO REQUESTED',
  'never-reviewed': 'NEVER REVIEWED',
  new: 'NEW',
  modified: 'MODIFIED',
  stale: 'STALE',
  'contract-change': 'CONTRACT CHANGE',
  'indirect-impact': 'INDIRECT IMPACT',
  cosmetic: 'COSMETIC',
  'route-handler': 'ROUTE HANDLER',
  service: 'SERVICE',
  client: 'CLIENT',
  repository: 'REPOSITORY',
  helper: 'HELPER',
  middleware: 'MIDDLEWARE',
  component: 'COMPONENT',
  page: 'PAGE',
  hook: 'HOOK',
  config: 'CONFIG',
  script: 'SCRIPT',
  seed: 'SEED',
  fixture: 'FIXTURE',
  test: 'TEST',
  'type-only': 'TYPE ONLY',
  unclassified: 'UNCLASSIFIED',
};
