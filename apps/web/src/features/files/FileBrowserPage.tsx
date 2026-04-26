import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
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

type FileTreeRow = {
  readonly path: string;
  readonly language: string;
  readonly size: number;
  readonly classification: { readonly classification: string } | null;
  readonly functionCount: number;
  readonly counts: {
    readonly approved: number;
    readonly rejected: number;
    readonly infoRequested: number;
    readonly stale: number;
    readonly neverReviewed: number;
  };
};

export function FileBrowserPage() {
  const { projectId } = useParams({ from: '/project/$projectId/files/' });
  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });
  const treeQuery = useQuery({
    queryKey: ['walkthrough', 'getFileTree'],
    queryFn: () => trpcClient.walkthrough.getFileTree.query(),
    enabled: status.data?.active != null,
  });

  if (status.isLoading) return <CenteredMessage label="Loading…" />;
  if (!status.data?.active)
    return <CenteredMessage label="No active codebase — open one from the picker." tone="error" />;

  const files = (treeQuery.data ?? []) as ReadonlyArray<FileTreeRow>;
  const totalCounts = files.reduce(
    (acc, f) => ({
      approved: acc.approved + f.counts.approved,
      rejected: acc.rejected + f.counts.rejected,
      infoRequested: acc.infoRequested + f.counts.infoRequested,
      stale: acc.stale + f.counts.stale,
      neverReviewed: acc.neverReviewed + f.counts.neverReviewed,
    }),
    { approved: 0, rejected: 0, infoRequested: 0, stale: 0, neverReviewed: 0 },
  );

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · FILE BROWSER"
          title="Files"
          tagline="Browse every analyzed file. Click a file to review it function-by-function."
          cells={[
            { label: 'FILES', value: String(files.length) },
            { label: 'APPROVED', value: String(totalCounts.approved) },
            { label: 'INFO REQ', value: String(totalCounts.infoRequested) },
            { label: 'PENDING', value: String(totalCounts.neverReviewed + totalCounts.stale) },
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
        {treeQuery.isLoading ? (
          <CenteredMessage label="Loading files…" />
        ) : treeQuery.error ? (
          <CenteredMessage label="Failed to load files" tone="error" />
        ) : files.length === 0 ? (
          <Panel>
            <PanelBody>
              <p className="text-sm text-text-tertiary">No analyzed files yet.</p>
            </PanelBody>
          </Panel>
        ) : (
          <Panel>
            <PanelHeader tone="sunken">
              <DraftingLabel size="sm">FIG. F · FILE TREE</DraftingLabel>
              <div className="flex-1" />
              <DraftingLabel size="xs">{files.length} files</DraftingLabel>
            </PanelHeader>
            <ul className="divide-y divide-border" data-testid="file-tree-list">
              {files.map((f) => (
                <li key={f.path}>
                  <Link
                    to="/project/$projectId/files/$"
                    params={{ projectId, _splat: f.path }}
                    className="flex items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-surface-sunken"
                    data-testid={`file-tree-row-${f.path}`}
                  >
                    {f.classification && (
                      <Chip variant={classificationToChipVariant(f.classification.classification)}>
                        {f.classification.classification.replace(/_/g, ' ').toUpperCase()}
                      </Chip>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-sm text-text-primary truncate">{f.path}</div>
                      <div className="font-mono text-xs text-text-tertiary">
                        {f.functionCount} fn · {f.size} bytes
                      </div>
                    </div>
                    <FileCountsRow counts={f.counts} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </main>
  );
}

function FileCountsRow(props: { counts: FileTreeRow['counts'] }) {
  const { counts } = props;
  return (
    <div className="flex items-center gap-1">
      {counts.approved > 0 && <Chip variant="approved">{counts.approved}</Chip>}
      {counts.rejected > 0 && <Chip variant="rejected">{counts.rejected}</Chip>}
      {counts.infoRequested > 0 && <Chip variant="info-requested">{counts.infoRequested}</Chip>}
      {counts.stale > 0 && <Chip variant="stale">{counts.stale}</Chip>}
      {counts.neverReviewed > 0 && <Chip variant="never-reviewed">{counts.neverReviewed}</Chip>}
    </div>
  );
}

function classificationToChipVariant(classification: string | undefined): ChipVariant {
  switch (classification) {
    case 'route_handler':
      return 'route-handler';
    case 'service':
      return 'service';
    case 'client':
      return 'client';
    case 'repository':
      return 'repository';
    case 'helper':
      return 'helper';
    case 'middleware':
      return 'middleware';
    case 'component':
      return 'component';
    case 'page':
      return 'page';
    case 'hook':
      return 'hook';
    case 'config':
      return 'config';
    case 'script':
      return 'script';
    case 'seed':
      return 'seed';
    case 'fixture':
      return 'fixture';
    case 'test':
      return 'test';
    case 'type_only':
      return 'type-only';
    default:
      return 'unclassified';
  }
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
