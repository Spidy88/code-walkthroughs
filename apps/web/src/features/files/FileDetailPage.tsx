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

type ReviewStatus = 'approved' | 'rejected' | 'info_requested';
type RuntimeState =
  | { readonly kind: 'never_reviewed' }
  | {
      readonly kind: 'reviewed_current';
      readonly current: { readonly status: ReviewStatus };
    }
  | { readonly kind: 'reviewed_stale'; readonly prior: { readonly status: ReviewStatus } }
  | { readonly kind: 'info_requested'; readonly current: { readonly status: ReviewStatus } };

type AnalyzedFn = {
  readonly nodeIdentity: string;
  readonly name: string;
  readonly kind: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly exported: boolean;
  readonly classification: {
    readonly classification: string;
    readonly justification: string | null;
  } | null;
  readonly runtimeState: RuntimeState;
};

type FilePayload = {
  readonly file: {
    readonly path: string;
    readonly language: string;
    readonly size: number;
    readonly classification: { readonly classification: string } | null;
    readonly runtimeState: RuntimeState;
  };
  readonly body: string;
  readonly functions: ReadonlyArray<AnalyzedFn>;
};

export function FileDetailPage() {
  const { projectId, _splat } = useParams({ from: '/project/$projectId/files/$' });
  const filePath = _splat ?? '';

  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });
  const fileQuery = useQuery({
    queryKey: ['walkthrough', 'getFile', filePath],
    queryFn: () => trpcClient.walkthrough.getFile.query({ filePath }),
    enabled: status.data?.active != null && filePath.length > 0,
  });

  if (status.isLoading) return <CenteredMessage label="Loading…" />;
  if (!status.data?.active)
    return <CenteredMessage label="No active codebase — open one from the picker." tone="error" />;
  if (filePath.length === 0) return <CenteredMessage label="No file path supplied." tone="error" />;

  const data = fileQuery.data as FilePayload | undefined;
  const lines = (data?.body ?? '').split('\n');
  const functions = data?.functions ?? [];
  // For each line number, the function (if any) starting on it. Lets
  // us drop a status chip exactly at the function's signature row.
  const fnByStart = new Map<number, AnalyzedFn>();
  for (const fn of functions) fnByStart.set(fn.startLine, fn);

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1280px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · FILE"
          title={filePath.split('/').at(-1) ?? filePath}
          tagline={filePath}
          cells={[
            { label: 'LANG', value: data?.file.language ?? '?' },
            { label: 'BYTES', value: String(data?.file.size ?? '?') },
            { label: 'FNS', value: String(functions.length) },
          ]}
        />
        <div className="flex items-center gap-3">
          <Link
            to="/project/$projectId/files"
            params={{ projectId }}
            className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
          >
            ← FILES
          </Link>
          {data?.file.classification && (
            <Chip variant={classificationToChipVariant(data.file.classification.classification)}>
              {data.file.classification.classification.replace(/_/g, ' ').toUpperCase()}
            </Chip>
          )}
          <RuntimeChip state={data?.file.runtimeState} />
        </div>
        {fileQuery.isLoading ? (
          <CenteredMessage label="Loading file…" />
        ) : fileQuery.error ? (
          <CenteredMessage label="Failed to load file" tone="error" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <Panel>
              <PanelHeader tone="sunken">
                <DraftingLabel size="sm">FIG. S · SOURCE</DraftingLabel>
                <div className="flex-1" />
                <DraftingLabel size="xs">{lines.length} lines</DraftingLabel>
              </PanelHeader>
              <div data-testid="file-detail-source">
                {lines.map((text, idx) => {
                  const lineNumber = idx + 1;
                  const fn = fnByStart.get(lineNumber);
                  return (
                    <div
                      key={lineNumber}
                      className="flex items-stretch font-mono text-[0.6875rem] leading-[1.55]"
                      data-line={lineNumber}
                      data-fn-start={fn ? fn.nodeIdentity : undefined}
                    >
                      <span
                        className="border-r border-border px-1.5 text-text-tertiary"
                        style={{ minWidth: 32, textAlign: 'right' }}
                      >
                        {lineNumber}
                      </span>
                      <pre className="overflow-x-auto whitespace-pre px-2.5 text-text-primary">
                        {text}
                      </pre>
                      {fn && (
                        <div className="flex items-center gap-1 px-1.5">
                          {fn.classification && (
                            <Chip
                              variant={classificationToChipVariant(
                                fn.classification.classification,
                              )}
                            >
                              {fn.classification.classification.replace(/_/g, ' ').toUpperCase()}
                            </Chip>
                          )}
                          <RuntimeChip state={fn.runtimeState} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
            <Panel>
              <PanelHeader tone="sunken">
                <DraftingLabel size="sm">FIG. N · NODES</DraftingLabel>
                <div className="flex-1" />
                <DraftingLabel size="xs">{functions.length} fn</DraftingLabel>
              </PanelHeader>
              {functions.length === 0 ? (
                <PanelBody>
                  <p className="text-sm text-text-tertiary">No analyzed functions in this file.</p>
                </PanelBody>
              ) : (
                <ul className="divide-y divide-border" data-testid="file-detail-functions">
                  {functions.map((fn) => (
                    <li
                      key={fn.nodeIdentity}
                      className="flex items-center gap-2 px-3.5 py-2"
                      data-testid={`file-detail-fn-${fn.nodeIdentity}`}
                    >
                      <span className="font-mono text-xs text-text-tertiary">L{fn.startLine}</span>
                      <span className="font-mono text-sm text-text-primary truncate flex-1">
                        {fn.name}
                      </span>
                      {fn.classification && (
                        <Chip
                          variant={classificationToChipVariant(fn.classification.classification)}
                        >
                          {fn.classification.classification.replace(/_/g, ' ').toUpperCase()}
                        </Chip>
                      )}
                      <RuntimeChip state={fn.runtimeState} />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </div>
    </main>
  );
}

function RuntimeChip(props: { state: RuntimeState | undefined }) {
  if (!props.state) return null;
  switch (props.state.kind) {
    case 'never_reviewed':
      return <Chip variant="never-reviewed">NEW</Chip>;
    case 'reviewed_current': {
      if (props.state.current.status === 'approved')
        return <Chip variant="approved">APPROVED</Chip>;
      if (props.state.current.status === 'rejected')
        return <Chip variant="rejected">REJECTED</Chip>;
      return <Chip variant="info-requested">INFO REQ</Chip>;
    }
    case 'reviewed_stale':
      return <Chip variant="stale">STALE</Chip>;
    case 'info_requested':
      return <Chip variant="info-requested">INFO REQ</Chip>;
  }
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
