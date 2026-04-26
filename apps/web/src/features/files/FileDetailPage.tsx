import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Chip,
  type ChipVariant,
  ClassificationStamp,
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
    readonly confidence: string;
    readonly justification: string | null;
    readonly source: string;
  } | null;
  readonly runtimeState: RuntimeState;
};

type FilePayload = {
  readonly file: {
    readonly path: string;
    readonly language: string;
    readonly size: number;
    readonly classification: {
      readonly classification: string;
      readonly confidence: string;
      readonly source: string;
    } | null;
    readonly runtimeState: RuntimeState;
  };
  readonly body: string;
  readonly functions: ReadonlyArray<AnalyzedFn>;
};

export function FileDetailPage() {
  const { projectId, _splat } = useParams({ from: '/project/$projectId/files/$' });
  const filePath = _splat ?? '';
  const queryClient = useQueryClient();
  // Pending file-level cascade — if the server reports conflicts the
  // reviewer hasn't picked a resolution for, hold the in-flight
  // request here while the conflict prompt asks how to proceed.
  const [pendingCascade, setPendingCascade] = useState<{
    readonly status: ReviewStatus;
    readonly comment: string | null;
    readonly conflicts: ReadonlyArray<{
      readonly nodeIdentity: string;
      readonly currentStatus: ReviewStatus;
    }>;
  } | null>(null);

  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });
  const fileQuery = useQuery({
    queryKey: ['walkthrough', 'getFile', filePath],
    queryFn: () => trpcClient.walkthrough.getFile.query({ filePath }),
    enabled: status.data?.active != null && filePath.length > 0,
  });

  const setFileStatusMutation = useMutation({
    mutationFn: (input: {
      status: ReviewStatus;
      comment: string | null;
      conflictResolution: 'preserve' | 'override' | null;
    }) =>
      trpcClient.review.setFileStatus.mutate({
        filePath,
        status: input.status,
        comment: input.comment ?? undefined,
        conflictResolution: input.conflictResolution ?? undefined,
      }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'getFile', filePath] }),
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'getFileTree'] }),
      ]);
    },
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
            <>
              <Chip variant={classificationToChipVariant(data.file.classification.classification)}>
                {data.file.classification.classification.replace(/_/g, ' ').toUpperCase()}
              </Chip>
              <ClassificationStamp
                source={data.file.classification.source}
                confidence={data.file.classification.confidence}
              />
            </>
          )}
          <RuntimeChip state={data?.file.runtimeState} />
        </div>
        {pendingCascade && (
          <ConflictPrompt
            pending={pendingCascade}
            isPending={setFileStatusMutation.isPending}
            functions={data?.functions ?? []}
            onPreserve={() =>
              setFileStatusMutation.mutate(
                {
                  status: pendingCascade.status,
                  comment: pendingCascade.comment,
                  conflictResolution: 'preserve',
                },
                { onSuccess: () => setPendingCascade(null) },
              )
            }
            onOverride={() =>
              setFileStatusMutation.mutate(
                {
                  status: pendingCascade.status,
                  comment: pendingCascade.comment,
                  conflictResolution: 'override',
                },
                { onSuccess: () => setPendingCascade(null) },
              )
            }
            onCancel={() => setPendingCascade(null)}
          />
        )}
        {data && (
          <FileActionRow
            isPending={setFileStatusMutation.isPending}
            error={setFileStatusMutation.error}
            onAction={(actionStatus, comment) => {
              setFileStatusMutation.mutate(
                {
                  status: actionStatus,
                  comment,
                  conflictResolution: null,
                },
                {
                  onSuccess: (result) => {
                    if (!result.applied) {
                      setPendingCascade({
                        status: actionStatus,
                        comment,
                        conflicts: result.conflicts,
                      });
                    }
                  },
                },
              );
            }}
          />
        )}
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
                            <>
                              <Chip
                                variant={classificationToChipVariant(
                                  fn.classification.classification,
                                )}
                              >
                                {fn.classification.classification.replace(/_/g, ' ').toUpperCase()}
                              </Chip>
                              <ClassificationStamp
                                source={fn.classification.source}
                                confidence={fn.classification.confidence}
                              />
                            </>
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

function FileActionRow(props: {
  isPending: boolean;
  error: unknown;
  onAction: (status: ReviewStatus, comment: string | null) => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <Panel>
      <PanelHeader tone="sunken">
        <DraftingLabel size="sm">FIG. R · FILE ACTION</DraftingLabel>
        <span className="font-mono text-[0.625rem] text-text-tertiary">
          cascades to every function in the file
        </span>
      </PanelHeader>
      <PanelBody>
        <textarea
          name="file-comment"
          rows={2}
          placeholder="Comment (required for Request Info; optional otherwise)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={props.isPending}
          className="block w-full resize-y border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-primary"
          data-testid="file-action-comment"
        />
        {props.error !== null && props.error !== undefined && (
          <div className="mt-2 text-sm text-error" data-testid="file-action-error">
            {String((props.error as Error).message ?? props.error)}
          </div>
        )}
      </PanelBody>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-sunken px-3.5 py-2">
        <FileActionButton
          label="Approve file"
          tone="approve"
          disabled={props.isPending}
          onClick={() => {
            props.onAction('approved', comment.trim() || null);
            setComment('');
          }}
          testId="file-action-approve"
        />
        <FileActionButton
          label="Reject file"
          tone="reject"
          disabled={props.isPending}
          onClick={() => {
            props.onAction('rejected', comment.trim() || null);
            setComment('');
          }}
          testId="file-action-reject"
        />
        <FileActionButton
          label="Request info"
          tone="info"
          disabled={props.isPending || comment.trim() === ''}
          onClick={() => {
            const trimmed = comment.trim();
            if (!trimmed) return;
            props.onAction('info_requested', trimmed);
            setComment('');
          }}
          testId="file-action-info"
        />
      </div>
    </Panel>
  );
}

function FileActionButton(props: {
  label: string;
  tone: 'approve' | 'reject' | 'info';
  disabled: boolean;
  onClick: () => void;
  testId: string;
}) {
  const styles = {
    approve: 'border-approve-600 bg-approve-600 text-text-inverse hover:bg-approve-500',
    reject: 'border-reject-600 bg-transparent text-reject-600 hover:bg-reject-soft',
    info: 'border-info-600 bg-transparent text-info-600 hover:bg-info-soft',
  } as const;
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={[
        'border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-60',
        styles[props.tone],
      ].join(' ')}
      data-testid={props.testId}
    >
      {props.label}
    </button>
  );
}

function ConflictPrompt(props: {
  pending: {
    readonly status: ReviewStatus;
    readonly comment: string | null;
    readonly conflicts: ReadonlyArray<{
      readonly nodeIdentity: string;
      readonly currentStatus: ReviewStatus;
    }>;
  };
  functions: ReadonlyArray<AnalyzedFn>;
  isPending: boolean;
  onPreserve: () => void;
  onOverride: () => void;
  onCancel: () => void;
}) {
  const namesByIdentity = new Map(props.functions.map((f) => [f.nodeIdentity, f.name]));
  return (
    <div
      className="flex flex-col gap-2 border border-info-600 bg-info-soft px-3 py-2"
      data-testid="file-action-conflict-prompt"
    >
      <div className="flex items-center gap-2">
        <DraftingLabel size="xs" tone="primary">
          CONFLICT
        </DraftingLabel>
        <span className="font-mono text-xs text-text-primary">
          {props.pending.conflicts.length} function(s) already have a different status. Apply the
          file action as <strong>{props.pending.status.replace('_', ' ')}</strong>?
        </span>
      </div>
      <ul className="flex flex-col gap-0.5 pl-1" data-testid="file-action-conflict-list">
        {props.pending.conflicts.map((c) => (
          <li
            key={c.nodeIdentity}
            className="font-mono text-xs text-text-secondary"
            data-testid={`file-action-conflict-row-${c.nodeIdentity}`}
          >
            {namesByIdentity.get(c.nodeIdentity) ?? c.nodeIdentity}{' '}
            <span className="text-text-tertiary">— currently {c.currentStatus}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={props.onPreserve}
          disabled={props.isPending}
          className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="file-action-conflict-preserve"
        >
          Preserve
        </button>
        <button
          type="button"
          onClick={props.onOverride}
          disabled={props.isPending}
          className="border border-reject-600 bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-reject-600 hover:bg-reject-soft disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="file-action-conflict-override"
        >
          Override
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          disabled={props.isPending}
          className="border border-border-strong bg-surface px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-secondary hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="file-action-conflict-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
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
