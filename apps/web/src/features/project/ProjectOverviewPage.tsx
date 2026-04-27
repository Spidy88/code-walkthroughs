import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useMemo } from 'react';
import {
  Chip,
  type ChipVariant,
  DraftingLabel,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';

type EntryPointRow = {
  readonly id: string;
  readonly kind: string;
  readonly framework: string;
  readonly nodeIdentity: string;
  readonly metadata: unknown;
};

type PathRow = {
  readonly id: string;
  readonly entryPointId: string;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly category: string | null;
  readonly categoryOrder: number | null;
  readonly nodes: ReadonlyArray<{ readonly nodeIdentity: string; readonly position: number }>;
};

const ENTRY_POINT_KIND_LABEL: Record<string, string> = {
  http_route: 'HTTP routes',
  cli_command: 'CLI commands',
  job: 'Jobs',
  event_handler: 'Event handlers',
  frontend_route: 'Frontend routes',
  pinned: 'Pinned',
};

const ENTRY_POINT_KIND_ORDER: ReadonlyArray<string> = [
  'http_route',
  'cli_command',
  'job',
  'event_handler',
  'frontend_route',
  'pinned',
];

export function ProjectOverviewPage() {
  const { projectId } = useParams({ from: '/project/$projectId/' });

  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });

  const projects = useQuery({
    queryKey: ['walkthrough', 'listProjects'],
    queryFn: () => trpcClient.walkthrough.listProjects.query(),
    enabled: status.data?.active != null,
  });

  const entries = useQuery({
    queryKey: ['walkthrough', 'entryPoints'],
    queryFn: () => trpcClient.walkthrough.entryPoints.query(),
    enabled: status.data?.active != null,
  });

  const pathsQuery = useQuery({
    queryKey: ['walkthrough', 'paths'],
    queryFn: () => trpcClient.walkthrough.paths.query(),
    enabled: status.data?.active != null,
  });

  const project = projects.data?.find((p) => p.id === projectId) ?? null;
  const entryPointRows = (entries.data ?? []) as ReadonlyArray<EntryPointRow>;
  const pathRows = (pathsQuery.data ?? []) as ReadonlyArray<PathRow>;

  const grouped = useMemo(() => groupByKind(entryPointRows, pathRows), [entryPointRows, pathRows]);

  if (status.isLoading) {
    return <CenteredMessage label="Loading…" />;
  }
  if (status.error) {
    return <CenteredMessage label="Failed to reach server" tone="error" />;
  }
  if (!status.data?.active) {
    return <NoActiveCodebaseSurface />;
  }
  if (status.data.active.hash !== projectId) {
    // URL points at a project that's not the active codebase. The user
    // probably navigated stale — send them home.
    return <ProjectMismatchSurface activeHash={status.data.active.hash} urlHash={projectId} />;
  }

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-6">
        <TitleBlock
          drawingLabel="DRAWING · PROJECT OVERVIEW"
          title={project?.name ?? 'Project'}
          tagline={project?.rootPath ?? ''}
          cells={[
            { label: 'DEV', value: 'local' },
            { label: 'REV', value: 'chunk-4' },
            { label: 'SHEET', value: 'overview' },
          ]}
        />
        <SummarySection entryCount={entryPointRows.length} pathCount={pathRows.length} />
        <EntriesSection
          grouped={grouped}
          projectId={projectId}
          isLoading={entries.isLoading || pathsQuery.isLoading}
          error={entries.error ?? pathsQuery.error}
        />
        <FooterNav
          projectId={projectId}
          isGitRepo={(status.data?.active as { isGitRepo?: boolean } | null)?.isGitRepo ?? false}
        />
      </div>
    </main>
  );
}

function SummarySection(props: { entryCount: number; pathCount: number }) {
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § A · SUMMARY
      </DraftingLabel>
      <Panel>
        <PanelBody>
          <dl
            className="grid grid-cols-[200px_1fr] gap-y-1.5 text-sm"
            data-testid="project-overview-summary"
          >
            <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
              ENTRY POINTS
            </dt>
            <dd className="text-text-primary">{props.entryCount}</dd>
            <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
              DETECTED PATHS
            </dt>
            <dd className="text-text-primary">{props.pathCount}</dd>
          </dl>
        </PanelBody>
      </Panel>
    </section>
  );
}

function EntriesSection(props: {
  grouped: ReadonlyArray<{
    readonly kind: string;
    readonly entries: ReadonlyArray<{
      readonly entry: EntryPointRow;
      readonly paths: ReadonlyArray<PathRow>;
    }>;
  }>;
  projectId: string;
  isLoading: boolean;
  error: unknown;
}) {
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § B · ENTRY POINTS
      </DraftingLabel>
      {props.isLoading ? (
        <Panel>
          <PanelBody>
            <div className="text-sm text-text-secondary">Loading…</div>
          </PanelBody>
        </Panel>
      ) : props.error ? (
        <Panel>
          <PanelBody>
            <div className="text-sm text-error">
              Failed to load entry points: {String((props.error as Error).message ?? props.error)}
            </div>
          </PanelBody>
        </Panel>
      ) : props.grouped.length === 0 ? (
        <Panel>
          <PanelBody>
            <div className="text-sm text-text-tertiary">
              No entry points detected. The codebase may not have any framework adapters that
              recognise its routes / CLIs / jobs.
            </div>
          </PanelBody>
        </Panel>
      ) : (
        <div className="space-y-4">
          {props.grouped.map((group) => (
            <KindGroup key={group.kind} group={group} projectId={props.projectId} />
          ))}
        </div>
      )}
    </section>
  );
}

function KindGroup(props: {
  group: {
    readonly kind: string;
    readonly entries: ReadonlyArray<{
      readonly entry: EntryPointRow;
      readonly paths: ReadonlyArray<PathRow>;
    }>;
  };
  projectId: string;
}) {
  // The grouping function now sets `kind` to the category label
  // directly (e.g. "GET routes") rather than the raw entry-point
  // kind string. Fall back to the kind table for legacy callers.
  const label = ENTRY_POINT_KIND_LABEL[props.group.kind] ?? props.group.kind;
  return (
    <Panel>
      <PanelHeader>
        <DraftingLabel size="sm">FIG · {label.toUpperCase()}</DraftingLabel>
        <div className="flex-1" />
        <DraftingLabel size="xs">{props.group.entries.length}</DraftingLabel>
      </PanelHeader>
      <ul
        className="divide-y divide-border"
        data-testid={`project-overview-kind-${props.group.kind}`}
      >
        {props.group.entries.map(({ entry, paths }) => (
          <EntryRow key={entry.id} entry={entry} paths={paths} projectId={props.projectId} />
        ))}
      </ul>
    </Panel>
  );
}

function EntryRow(props: {
  entry: EntryPointRow;
  paths: ReadonlyArray<PathRow>;
  projectId: string;
}) {
  const meta = props.entry.metadata as Record<string, unknown> | null;
  const route = typeof meta?.route === 'string' ? meta.route : null;
  const method = typeof meta?.method === 'string' ? meta.method : null;
  const display = route
    ? method
      ? `${method} ${route}`
      : route
    : entryDisplayFromIdentity(props.entry.nodeIdentity);

  return (
    <li className="flex items-start gap-3 px-3.5 py-2 text-sm">
      <Chip variant={chipForKind(props.entry.kind)}>{props.entry.framework}</Chip>
      <div className="flex-1 min-w-0">
        <div className="font-mono text-sm text-text-primary truncate">{display}</div>
        <div className="font-mono text-xs text-text-tertiary truncate">
          {props.entry.nodeIdentity}
        </div>
        {props.paths.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {props.paths.map((p) => (
              <li key={p.id} className="font-mono text-xs">
                <Link
                  to="/project/$projectId/path/$pathId"
                  params={{ projectId: props.projectId, pathId: p.id }}
                  className="text-primary hover:underline"
                  data-testid="project-overview-path-link"
                >
                  → {p.nodeCount} node{p.nodeCount === 1 ? '' : 's'}, depth {p.maxDepth}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {props.paths.length === 0 && (
          <div className="mt-1.5 text-xs text-text-tertiary">No path traced from this entry.</div>
        )}
      </div>
    </li>
  );
}

function FooterNav(props: { projectId: string; isGitRepo: boolean }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Link
        to="/codebase"
        className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
      >
        ← ANALYSIS
      </Link>
      <Link
        to="/prep"
        className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
        data-testid="project-overview-prep-link"
      >
        PREP QUEUE →
      </Link>
      <Link
        to="/project/$projectId/files"
        params={{ projectId: props.projectId }}
        className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
        data-testid="project-overview-files-link"
      >
        FILE BROWSER →
      </Link>
      <Link
        to="/rules"
        className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
        data-testid="project-overview-rules-link"
      >
        RULES →
      </Link>
      <Link
        to="/progress"
        className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
        data-testid="project-overview-progress-link"
      >
        PROGRESS →
      </Link>
      {props.isGitRepo ? (
        <Link
          to="/comparison"
          className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
          data-testid="project-overview-comparison-link"
        >
          COMPARISON →
        </Link>
      ) : (
        <span
          className="border border-border bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-tertiary"
          title="Comparison mode requires a git repository"
          data-testid="project-overview-comparison-link-disabled"
        >
          COMPARISON · NO GIT
        </span>
      )}
      <span className="font-mono text-xs text-text-tertiary">project: {props.projectId}</span>
    </div>
  );
}

function NoActiveCodebaseSurface() {
  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-6">
        <TitleBlock
          drawingLabel="DRAWING · PROJECT"
          title="No active codebase"
          tagline="Open one from the picker to view a project overview."
          cells={[{ label: 'STATE', value: 'inactive' }]}
        />
        <Link
          to="/"
          className="inline-block border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
        >
          ← BACK TO PICKER
        </Link>
      </div>
    </main>
  );
}

function ProjectMismatchSurface(props: { activeHash: string; urlHash: string }) {
  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-6">
        <TitleBlock
          drawingLabel="DRAWING · PROJECT"
          title="Project not active"
          tagline="The URL points at a project that isn't the currently-active codebase."
          cells={[{ label: 'STATE', value: 'mismatch' }]}
        />
        <Panel>
          <PanelBody>
            <dl className="grid grid-cols-[160px_1fr] gap-y-1.5 text-sm">
              <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
                URL HASH
              </dt>
              <dd className="font-mono text-text-primary">{props.urlHash}</dd>
              <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
                ACTIVE HASH
              </dt>
              <dd className="font-mono text-text-primary">{props.activeHash}</dd>
            </dl>
          </PanelBody>
        </Panel>
        <Link
          to="/project/$projectId"
          params={{ projectId: props.activeHash }}
          className="inline-block border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-hover"
        >
          GO TO ACTIVE PROJECT ↗
        </Link>
      </div>
    </main>
  );
}

function CenteredMessage(props: { label: string; tone?: 'tertiary' | 'error' }) {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-8">
      <div className={props.tone === 'error' ? 'text-error' : 'text-text-tertiary'}>
        {props.label}
      </div>
    </main>
  );
}

function chipForKind(kind: string): ChipVariant {
  switch (kind) {
    case 'http_route':
      return 'route-handler';
    case 'frontend_route':
      return 'page';
    case 'event_handler':
      return 'middleware';
    case 'job':
      return 'service';
    case 'cli_command':
      return 'script';
    default:
      return 'unclassified';
  }
}

function entryDisplayFromIdentity(identity: string): string {
  // node identity is `<project>:<file-path>:<symbol-path>`
  const parts = identity.split(':');
  return parts.slice(1).join(':') || identity;
}

function groupByKind(
  entries: ReadonlyArray<EntryPointRow>,
  paths: ReadonlyArray<PathRow>,
): ReadonlyArray<{
  readonly kind: string;
  readonly entries: ReadonlyArray<{
    readonly entry: EntryPointRow;
    readonly paths: ReadonlyArray<PathRow>;
  }>;
}> {
  const pathsByEntry = new Map<string, PathRow[]>();
  for (const p of paths) {
    const arr = pathsByEntry.get(p.entryPointId) ?? [];
    arr.push(p);
    pathsByEntry.set(p.entryPointId, arr);
  }

  // Chunk 12: prefer the path's `category` (deterministic categoriser
  // baked into detectPaths today, future LLM categoriser later) over
  // the raw entry kind. Falls back to entry.kind when no path has a
  // category — keeps prior behavior intact for fixtures pre-dating
  // chunk 12.
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      order: number;
      items: Array<{ entry: EntryPointRow; paths: PathRow[] }>;
    }
  >();
  for (const entry of entries) {
    const entryPaths = pathsByEntry.get(entry.id) ?? [];
    const firstCategorised = entryPaths.find((p) => p.category !== null);
    const groupKey = firstCategorised?.category ?? `kind:${entry.kind}`;
    const groupLabel = firstCategorised?.category
      ? firstCategorised.category
      : (ENTRY_POINT_KIND_LABEL[entry.kind] ?? entry.kind);
    const groupOrder =
      firstCategorised?.categoryOrder ?? 200 + (ENTRY_POINT_KIND_ORDER.indexOf(entry.kind) ?? 99);
    const slot = groups.get(groupKey) ?? {
      key: groupKey,
      label: groupLabel,
      order: groupOrder,
      items: [],
    };
    slot.items.push({ entry, paths: entryPaths });
    groups.set(groupKey, slot);
  }

  return [...groups.values()]
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
    .map((g) => ({ kind: g.label, entries: sortEntries(g.items) }));
}

function sortEntries(
  arr: Array<{ entry: EntryPointRow; paths: PathRow[] }>,
): Array<{ entry: EntryPointRow; paths: PathRow[] }> {
  return [...arr].sort((a, b) => a.entry.nodeIdentity.localeCompare(b.entry.nodeIdentity));
}
