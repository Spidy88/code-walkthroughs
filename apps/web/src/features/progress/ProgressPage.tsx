import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Chip,
  DraftingLabel,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';

type ScopeKind = 'codebase' | 'path' | 'file';

type Summary = {
  readonly scope: { readonly kind: string; readonly id: string | null };
  readonly counts: {
    readonly approved: number;
    readonly rejected: number;
    readonly infoRequested: number;
    readonly stale: number;
    readonly neverReviewed: number;
    readonly total: number;
  };
  readonly coverage: { readonly path: number; readonly full: number };
};

type PathListItem = {
  readonly id: string;
  readonly entryPointId: string;
  readonly nodeCount: number;
};
type EntryListItem = { readonly id: string; readonly nodeIdentity: string };

export function ProgressPage() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });
  const codebaseSummary = useQuery({
    queryKey: ['progress', 'summary', 'codebase'],
    queryFn: () => trpcClient.progress.summary.query({ kind: 'codebase' }),
    enabled: status.data?.active != null,
  });
  const pathsQuery = useQuery({
    queryKey: ['walkthrough', 'paths'],
    queryFn: () => trpcClient.walkthrough.paths.query(),
    enabled: status.data?.active != null,
  });
  const entriesQuery = useQuery({
    queryKey: ['walkthrough', 'entryPoints'],
    queryFn: () => trpcClient.walkthrough.entryPoints.query(),
    enabled: status.data?.active != null,
  });

  const resetMutation = useMutation({
    mutationFn: (input: { kind: ScopeKind; id?: string }) =>
      trpcClient.progress.reset.mutate(input),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['progress'] }),
        queryClient.invalidateQueries({ queryKey: ['walkthrough'] }),
      ]);
    },
  });

  if (status.isLoading) return <Centered label="Loading…" />;
  if (!status.data?.active)
    return <Centered label="No active codebase — open one from the picker." tone="error" />;

  const cb = (codebaseSummary.data ?? null) as Summary | null;
  const paths = (pathsQuery.data ?? []) as ReadonlyArray<PathListItem>;
  const entries = (entriesQuery.data ?? []) as ReadonlyArray<EntryListItem>;
  const projectId = status.data.active.hash;
  const entryByIdentity = new Map(entries.map((e) => [e.nodeIdentity, e]));

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · PROGRESS"
          title="Progress"
          tagline="Coverage at every scope. Reset to start a section over."
          cells={[
            { label: 'TOTAL', value: cb ? String(cb.counts.total) : '0' },
            { label: 'PATH COV', value: cb ? `${(cb.coverage.path * 100).toFixed(0)}%` : '—' },
            { label: 'FULL COV', value: cb ? `${(cb.coverage.full * 100).toFixed(0)}%` : '—' },
          ]}
        />
        <div className="flex items-center gap-3">
          <Link
            to="/project/$projectId"
            params={{ projectId }}
            className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
          >
            ← OVERVIEW
          </Link>
        </div>
        {cb && (
          <Panel>
            <PanelHeader tone="sunken">
              <DraftingLabel size="sm">FIG. C · CODEBASE</DraftingLabel>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => resetMutation.mutate({ kind: 'codebase' })}
                disabled={resetMutation.isPending}
                className="border border-reject-600 bg-transparent px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-reject-600 hover:bg-reject-soft disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="progress-reset-codebase"
              >
                Reset
              </button>
            </PanelHeader>
            <CountsRow counts={cb.counts} testId="progress-codebase-counts" />
          </Panel>
        )}
        <Panel>
          <PanelHeader tone="sunken">
            <DraftingLabel size="sm">FIG. P · PATHS</DraftingLabel>
            <div className="flex-1" />
            <DraftingLabel size="xs">{paths.length}</DraftingLabel>
          </PanelHeader>
          {paths.length === 0 ? (
            <PanelBody>
              <p className="text-sm text-text-tertiary">No paths in this codebase.</p>
            </PanelBody>
          ) : (
            <ul className="divide-y divide-border" data-testid="progress-paths-list">
              {paths.map((p) => (
                <PathRow
                  key={p.id}
                  path={p}
                  entryName={
                    entryByIdentity.get(
                      p.entryPointId, // entryByIdentity is keyed on nodeIdentity, not entry id; safe fallback
                    )?.nodeIdentity ??
                    entries.find((e) => e.id === p.entryPointId)?.nodeIdentity ??
                    p.entryPointId
                  }
                  onReset={() => resetMutation.mutate({ kind: 'path', id: p.id })}
                  isResetting={resetMutation.isPending}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}

function PathRow(props: {
  path: PathListItem;
  entryName: string;
  onReset: () => void;
  isResetting: boolean;
}) {
  const summary = useQuery({
    queryKey: ['progress', 'summary', 'path', props.path.id],
    queryFn: () => trpcClient.progress.summary.query({ kind: 'path', id: props.path.id }),
  });
  const data = (summary.data ?? null) as Summary | null;
  return (
    <li
      className="flex items-center gap-3 px-3.5 py-2"
      data-testid={`progress-path-${props.path.id}`}
    >
      <span className="font-mono text-xs text-text-tertiary">{props.path.id.slice(0, 8)}</span>
      <span className="flex-1 font-mono text-sm text-text-primary truncate">
        {props.entryName.split(':').at(-1) ?? props.entryName}
      </span>
      {data && <CountsBadges counts={data.counts} />}
      <button
        type="button"
        onClick={props.onReset}
        disabled={props.isResetting}
        className="border border-reject-600 bg-transparent px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-reject-600 hover:bg-reject-soft disabled:cursor-not-allowed disabled:opacity-60"
        data-testid={`progress-reset-path-${props.path.id}`}
      >
        Reset
      </button>
    </li>
  );
}

function CountsRow(props: { counts: Summary['counts']; testId: string }) {
  return (
    <PanelBody>
      <dl className="grid grid-cols-[200px_1fr] gap-y-1.5 text-sm" data-testid={props.testId}>
        <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
          APPROVED
        </dt>
        <dd className="text-text-primary">{props.counts.approved}</dd>
        <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
          REJECTED
        </dt>
        <dd className="text-text-primary">{props.counts.rejected}</dd>
        <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
          INFO REQ
        </dt>
        <dd className="text-text-primary">{props.counts.infoRequested}</dd>
        <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
          STALE
        </dt>
        <dd className="text-text-primary">{props.counts.stale}</dd>
        <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
          PENDING
        </dt>
        <dd className="text-text-primary">{props.counts.neverReviewed}</dd>
        <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
          TOTAL
        </dt>
        <dd className="text-text-primary">{props.counts.total}</dd>
      </dl>
    </PanelBody>
  );
}

function CountsBadges(props: { counts: Summary['counts'] }) {
  const c = props.counts;
  return (
    <div className="flex items-center gap-1">
      {c.approved > 0 && <Chip variant="approved">{c.approved}</Chip>}
      {c.rejected > 0 && <Chip variant="rejected">{c.rejected}</Chip>}
      {c.infoRequested > 0 && <Chip variant="info-requested">{c.infoRequested}</Chip>}
      {c.stale > 0 && <Chip variant="stale">{c.stale}</Chip>}
      {c.neverReviewed > 0 && <Chip variant="never-reviewed">{c.neverReviewed}</Chip>}
    </div>
  );
}

function Centered(props: { label: string; tone?: 'tertiary' | 'error' }) {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-8">
      <div className={props.tone === 'error' ? 'text-error' : 'text-text-tertiary'}>
        {props.label}
      </div>
    </main>
  );
}
