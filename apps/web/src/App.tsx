import { useQuery } from '@tanstack/react-query';
import {
  Chip,
  type ChipVariant,
  CornerTicks,
  DraftingLabel,
} from './components/blueprint/index.ts';
import { trpcClient } from './trpc.ts';

export function App() {
  const status = useQuery({
    queryKey: ['status'],
    queryFn: () => trpcClient.app.status.query(),
  });
  const recent = useQuery({
    queryKey: ['recent'],
    queryFn: () => trpcClient.codebase.listRecent.query(),
  });

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1280px]">
        <TitleBlock />
        <ServerStatusSection
          status={status.data ?? null}
          isLoading={status.isLoading}
          error={status.error}
        />
        <RecentCodebasesSection
          recent={recent.data ?? null}
          isLoading={recent.isLoading}
          error={recent.error}
        />
        <ComponentShowcase />
      </div>
    </main>
  );
}

function TitleBlock() {
  return (
    <div
      className="mb-8 grid border bg-surface"
      style={{
        borderColor: 'var(--color-primary)',
        gridTemplateColumns: '1fr 160px 160px 160px',
      }}
    >
      <div className="border-r border-border px-4 py-3">
        <DraftingLabel size="sm" tone="tertiary">
          DRAWING · CODE_WALKTHROUGHS
        </DraftingLabel>
        <div className="mt-1 text-2xl font-bold leading-tight tracking-tight text-text-primary">
          Code Walkthroughs
        </div>
        <div className="mt-1 text-sm text-text-secondary">Walk the path, not the diff.</div>
      </div>
      <TitleBlockCell label="DEV" value="local" />
      <TitleBlockCell label="REV" value="chunk-1B" />
      <TitleBlockCell label="SHEET" value="01 / 22" />
    </div>
  );
}

function TitleBlockCell(props: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-3 py-2.5 last:border-r-0">
      <DraftingLabel size="xs">{props.label}</DraftingLabel>
      <div className="mt-1 text-xs text-text-primary">{props.value}</div>
    </div>
  );
}

function ServerStatusSection(props: {
  status: { llmEnabled: boolean; active: { absolutePath: string } | null } | null;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <section className="mb-8">
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § A · SERVER STATUS
      </DraftingLabel>
      <div className="border border-border-strong bg-surface p-4">
        {props.isLoading ? (
          <div className="text-sm text-text-secondary">Loading…</div>
        ) : props.error ? (
          <div className="text-sm text-error">Failed to reach server: {String(props.error)}</div>
        ) : (
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
            <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
              LLM ENABLED
            </dt>
            <dd className="text-text-primary">{props.status?.llmEnabled ? 'yes' : 'no'}</dd>
            <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
              ACTIVE CODEBASE
            </dt>
            <dd className="text-text-primary">{props.status?.active?.absolutePath ?? 'none'}</dd>
          </dl>
        )}
      </div>
    </section>
  );
}

function RecentCodebasesSection(props: {
  recent: ReadonlyArray<{ hash: string; absolutePath: string; label: string | null }> | null;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <section className="mb-8">
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § B · RECENT CODEBASES
      </DraftingLabel>
      <div className="border border-border-strong bg-surface">
        {props.isLoading ? (
          <div className="p-4 text-sm text-text-secondary">Loading…</div>
        ) : props.error ? (
          <div className="p-4 text-sm text-error">Failed to load recent codebases.</div>
        ) : !props.recent || props.recent.length === 0 ? (
          <div className="p-4 text-sm text-text-tertiary">No codebases yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {props.recent.map((row) => (
              <li key={row.hash} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-text-primary">{row.label ?? row.absolutePath}</span>
                <span className="font-mono text-xs text-text-tertiary">{row.hash}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ComponentShowcase() {
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

      <ShowcaseCard label="C.2 · CHIP — REVIEW STATUS">
        <ChipRow
          variants={['approved', 'rejected', 'info-requested', 'never-reviewed']}
          labels={{
            approved: 'APPROVED',
            rejected: 'REJECTED',
            'info-requested': 'INFO REQUESTED',
            'never-reviewed': 'NEVER REVIEWED',
          }}
        />
      </ShowcaseCard>

      <ShowcaseCard label="C.3 · CHIP — CHANGE STATE">
        <ChipRow
          variants={['new', 'modified', 'stale']}
          labels={{
            new: 'NEW',
            modified: 'MODIFIED',
            stale: 'STALE',
          }}
        />
      </ShowcaseCard>

      <ShowcaseCard label="C.4 · CHIP — COMPARISON">
        <ChipRow
          variants={['contract-change', 'indirect-impact', 'cosmetic']}
          labels={{
            'contract-change': 'CONTRACT CHANGE',
            'indirect-impact': 'INDIRECT IMPACT',
            cosmetic: 'COSMETIC',
          }}
        />
      </ShowcaseCard>

      <ShowcaseCard label="C.5 · CHIP — CLASSIFICATION">
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
          labels={{
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
          }}
        />
      </ShowcaseCard>

      <ShowcaseCard label="C.6 · CORNER TICKS — ON A PANEL">
        <div className="grid grid-cols-2 gap-6">
          <div className="relative border border-border-strong bg-surface p-4">
            <CornerTicks tone="primary" />
            <DraftingLabel size="sm">FIG. D · PRIMARY TICKS</DraftingLabel>
            <p className="mt-2 text-sm text-text-secondary">
              Used on focused panels — the code panel of the currently-active node, the checklist
              alongside it. Indicates: this is the surface the reviewer is working on.
            </p>
          </div>
          <div className="relative border border-border-strong bg-surface p-4">
            <CornerTicks tone="border-strong" />
            <DraftingLabel size="sm">FIG. E · NEUTRAL TICKS</DraftingLabel>
            <p className="mt-2 text-sm text-text-secondary">
              The understated variant — same drafting cue, lower visual weight. Used when emphasis
              isn't called for.
            </p>
          </div>
        </div>
      </ShowcaseCard>
    </section>
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
