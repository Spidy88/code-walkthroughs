import { useQuery } from '@tanstack/react-query';
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
        <StylePreview />
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
        <div className="mb-1 font-mono text-[0.625rem] uppercase tracking-widest text-text-tertiary">
          DRAWING · CODE_WALKTHROUGHS
        </div>
        <div className="text-2xl font-bold leading-tight tracking-tight text-text-primary">
          Code Walkthroughs
        </div>
        <div className="mt-1 text-sm text-text-secondary">Walk the path, not the diff.</div>
      </div>
      <TitleBlockCell label="DEV" value="local" />
      <TitleBlockCell label="REV" value="chunk-1A" />
      <TitleBlockCell label="SHEET" value="01 / 22" />
    </div>
  );
}

function TitleBlockCell(props: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${props.last ? '' : 'border-r border-border'}`}>
      <div className="font-mono text-[0.625rem] uppercase tracking-wider text-text-tertiary">
        {props.label}
      </div>
      <div className="text-xs text-text-primary">{props.value}</div>
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
      <SectionLabel>§ A · SERVER STATUS</SectionLabel>
      <div className="border border-border-strong bg-surface p-4">
        {props.isLoading ? (
          <div className="text-sm text-text-secondary">Loading…</div>
        ) : props.error ? (
          <div className="text-sm text-error">Failed to reach server: {String(props.error)}</div>
        ) : (
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
            <dt className="font-mono uppercase tracking-wider text-text-tertiary text-xs self-center">
              LLM ENABLED
            </dt>
            <dd className="text-text-primary">{props.status?.llmEnabled ? 'yes' : 'no'}</dd>
            <dt className="font-mono uppercase tracking-wider text-text-tertiary text-xs self-center">
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
      <SectionLabel>§ B · RECENT CODEBASES</SectionLabel>
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

function StylePreview() {
  return (
    <section>
      <SectionLabel>§ C · STYLE PREVIEW</SectionLabel>

      <div className="mb-6 border border-border-strong bg-surface p-4">
        <SubsectionLabel>C.1 · TYPE SCALE</SubsectionLabel>
        <div className="space-y-2 mt-3">
          <div className="text-4xl font-bold tracking-tight leading-tight">4xl — Display</div>
          <div className="text-3xl font-bold tracking-tight leading-tight">3xl — Hero</div>
          <div className="text-2xl font-bold tracking-tight leading-snug">2xl — Page title</div>
          <div className="text-xl font-semibold leading-snug">xl — Section heading</div>
          <div className="text-lg font-semibold">lg — Sub-heading</div>
          <div className="text-base">
            base — Body text. The reviewer reads code in the order it runs, not the order it sits in
            files.
          </div>
          <div className="text-sm text-text-secondary">sm — Secondary copy</div>
          <div className="text-xs font-mono uppercase tracking-widest text-text-tertiary">
            xs — Drafting label
          </div>
          <div className="font-mono text-sm">
            mono — const charge = await billing.charge(payload)
          </div>
        </div>
      </div>

      <div className="mb-6 border border-border-strong bg-surface p-4">
        <SubsectionLabel>C.2 · NEUTRAL PALETTE</SubsectionLabel>
        <div className="mt-3 grid grid-cols-12 gap-1.5">
          <Swatch color="var(--color-background)" label="bg" />
          <Swatch color="var(--color-surface)" label="surface" />
          <Swatch color="var(--color-surface-sunken)" label="sunken" />
          <Swatch color="var(--color-paper-150)" label="paper-150" />
          <Swatch color="var(--color-paper-200)" label="border" />
          <Swatch color="var(--color-paper-300)" label="paper-300" />
          <Swatch color="var(--color-paper-400)" label="border-strong" />
          <Swatch color="var(--color-paper-500)" label="text-3" />
          <Swatch color="var(--color-paper-600)" label="text-2" />
          <Swatch color="var(--color-paper-700)" label="paper-700" />
          <Swatch color="var(--color-paper-800)" label="paper-800" />
          <Swatch color="var(--color-paper-900)" label="text-1" />
        </div>
      </div>

      <div className="mb-6 border border-border-strong bg-surface p-4">
        <SubsectionLabel>C.3 · SEMANTIC PALETTE</SubsectionLabel>
        <div className="mt-3 grid grid-cols-12 gap-1.5">
          <Swatch color="var(--color-primary-600)" label="primary" />
          <Swatch color="var(--color-approve-600)" label="approve" />
          <Swatch color="var(--color-reject-600)" label="reject" />
          <Swatch color="var(--color-info-600)" label="info" />
          <Swatch color="var(--color-warn-600)" label="warn" />
          <Swatch color="var(--color-modified-500)" label="modified" />
          <Swatch color="var(--color-stale-500)" label="stale" />
          <Swatch color="var(--color-new-500)" label="new" />
          <Swatch color="var(--color-accent-600)" label="accent" />
          <Swatch color="var(--color-state-contract)" label="contract" />
          <Swatch color="var(--color-state-indirect)" label="indirect" />
          <Swatch color="var(--color-deleted-500)" label="deleted" />
        </div>
      </div>

      <div className="border border-border-strong bg-surface p-4">
        <SubsectionLabel>C.4 · STATE CHIPS (PROVISIONAL)</SubsectionLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          <ProvisionalChip
            label="APPROVED"
            color="var(--color-approve-600)"
            bg="var(--color-approve-soft)"
          />
          <ProvisionalChip
            label="REJECTED"
            color="var(--color-reject-600)"
            bg="var(--color-reject-soft)"
          />
          <ProvisionalChip label="INFO" color="var(--color-info-600)" bg="var(--color-info-soft)" />
          <ProvisionalChip
            label="NEW"
            color="var(--color-approve-600)"
            bg="var(--color-approve-soft)"
          />
          <ProvisionalChip
            label="MODIFIED"
            color="var(--color-modified-500)"
            bg="var(--color-warn-soft)"
          />
          <ProvisionalChip
            label="STALE"
            color="var(--color-stale-500)"
            bg="var(--color-stale-soft)"
          />
          <ProvisionalChip
            label="CONTRACT CHANGE"
            color="var(--color-state-contract)"
            bg="var(--color-state-contract-soft)"
          />
          <ProvisionalChip
            label="INDIRECT IMPACT"
            color="var(--color-state-indirect)"
            bg="var(--color-state-indirect-soft)"
          />
          <ProvisionalChip
            label="NEVER REVIEWED"
            color="var(--color-text-tertiary)"
            bg="var(--color-surface-sunken)"
            hideDot
          />
        </div>
        <p className="mt-3 text-xs text-text-tertiary">
          Provisional rendering — replaced by the &lt;Chip&gt; component in chunk 1B.
        </p>
      </div>
    </section>
  );
}

function SectionLabel(props: { children: string }) {
  return (
    <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-text-tertiary">
      {props.children}
    </div>
  );
}

function SubsectionLabel(props: { children: string }) {
  return (
    <div className="font-mono text-xs font-semibold uppercase tracking-widest text-text-tertiary border-b border-border pb-1.5">
      {props.children}
    </div>
  );
}

function Swatch(props: { color: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        className="h-10 border"
        style={{ background: props.color, borderColor: 'var(--color-border-strong)' }}
      />
      <div className="font-mono text-[0.625rem] uppercase tracking-wide text-text-tertiary">
        {props.label}
      </div>
      <div className="font-mono text-[0.625rem] text-text-tertiary truncate">{props.color}</div>
    </div>
  );
}

function ProvisionalChip(props: { label: string; color: string; bg: string; hideDot?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-widest"
      style={{ color: props.color, background: props.bg, border: `1px solid ${props.color}` }}
    >
      {!props.hideDot && (
        <span style={{ background: props.color, width: 6, height: 6, display: 'inline-block' }} />
      )}
      {props.label}
    </span>
  );
}
