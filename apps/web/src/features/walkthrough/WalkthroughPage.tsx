import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Canvas,
  type CanvasEdgeType,
  type CanvasNodeType,
  Chip,
  type ChipVariant,
  DraftingLabel,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
  layoutCanvas,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';
import { getDefaultChecklist } from './checklists.ts';

type ReviewStatus = 'approved' | 'rejected' | 'info_requested';

type RuntimeState =
  | { readonly kind: 'never_reviewed' }
  | {
      readonly kind: 'reviewed_current';
      readonly current: { readonly status: ReviewStatus; readonly comment: string | null };
    }
  | {
      readonly kind: 'reviewed_stale';
      readonly prior: { readonly status: ReviewStatus; readonly comment: string | null };
    }
  | {
      readonly kind: 'info_requested';
      readonly current: { readonly status: ReviewStatus; readonly comment: string | null };
    };

type PathNodeRow = {
  readonly position: number;
  readonly nodeIdentity: string;
  readonly forkGroup: number | null;
  readonly changeKind: string | null;
  readonly cycleBackToPosition: number | null;
  readonly analyzed: {
    readonly nodeIdentity: string;
    readonly filePath: string;
    readonly name: string;
    readonly kind: string;
    readonly startLine: number;
    readonly endLine: number;
    readonly exported: boolean;
  } | null;
  readonly classification: {
    readonly classification: string;
    readonly confidence: string;
    readonly justification: string | null;
  } | null;
  readonly runtimeState: RuntimeState;
};

type PathPayload = {
  readonly path: { readonly id: string; readonly nodeCount: number; readonly maxDepth: number };
  readonly entryPoint: {
    readonly id: string;
    readonly kind: string;
    readonly framework: string;
    readonly metadata: unknown;
  } | null;
  readonly nodes: ReadonlyArray<PathNodeRow>;
};

const MAX_INLINE_BODY_LINES = 14;

export function WalkthroughPage() {
  const { projectId, pathId } = useParams({ from: '/project/$projectId/path/$pathId' });
  const search = useSearch({ from: '/project/$projectId/path/$pathId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const focusPosition = search.focus ?? 0;

  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });

  const pathQuery = useQuery({
    queryKey: ['walkthrough', 'getPath', pathId],
    queryFn: () => trpcClient.walkthrough.getPath.query({ pathId }),
    enabled: status.data?.active != null,
  });

  const setStatusMutation = useMutation({
    mutationFn: (input: {
      nodeIdentity: string;
      status: ReviewStatus;
      comment: string | null;
    }) =>
      trpcClient.review.setStatus.mutate({
        nodeIdentity: input.nodeIdentity,
        status: input.status,
        comment: input.comment ?? undefined,
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['walkthrough', 'getPath', pathId] });
    },
  });

  const clearStatusMutation = useMutation({
    mutationFn: (nodeIdentity: string) => trpcClient.review.clear.mutate({ nodeIdentity }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['walkthrough', 'getPath', pathId] });
    },
  });

  const data = pathQuery.data as PathPayload | undefined;
  const nodes = data?.nodes ?? [];
  const focusedNode = nodes.find((n) => n.position === focusPosition) ?? nodes[0] ?? null;

  const nodeQuery = useQuery({
    queryKey: ['walkthrough', 'getNode', focusedNode?.nodeIdentity],
    queryFn: () =>
      focusedNode
        ? trpcClient.walkthrough.getNode.query({ nodeIdentity: focusedNode.nodeIdentity })
        : Promise.resolve(null),
    enabled: status.data?.active != null && focusedNode != null,
  });

  const moveFocus = useCallback(
    (delta: number) => {
      if (nodes.length === 0) return;
      const next = Math.max(
        nodes[0]?.position ?? 0,
        Math.min(nodes[nodes.length - 1]?.position ?? 0, focusPosition + delta),
      );
      navigate({
        to: '/project/$projectId/path/$pathId',
        params: { projectId, pathId },
        search: { focus: next },
      });
    },
    [nodes, focusPosition, navigate, projectId, pathId],
  );

  const focusOn = useCallback(
    (position: number) => {
      navigate({
        to: '/project/$projectId/path/$pathId',
        params: { projectId, pathId },
        search: { focus: position },
      });
    },
    [navigate, projectId, pathId],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveFocus(1);
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveFocus(-1);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [moveFocus]);

  const focusedBody = nodeQuery.data?.body ?? '';

  const layout = useMemo(
    () =>
      buildLayout(nodes, {
        focusedIdentity: focusedNode?.nodeIdentity ?? null,
        focusedBody,
      }),
    [nodes, focusedNode, focusedBody],
  );

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
    return (
      <CenteredMessage
        label="The active codebase doesn't match this URL — return to the picker."
        tone="error"
      />
    );
  }

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · WALKTHROUGH"
          title={focusedNode?.analyzed?.name ?? 'Walkthrough'}
          tagline={focusedNode?.analyzed?.filePath ?? ''}
          cells={[
            { label: 'PATH', value: pathId.slice(0, 8) },
            {
              label: 'POSITION',
              value: `${focusPosition + 1} / ${data?.path.nodeCount ?? '?'}`,
            },
            { label: 'KEYS', value: 'j/k or ↑/↓' },
          ]}
        />
        {pathQuery.isLoading ? (
          <CenteredMessage label="Loading path…" />
        ) : pathQuery.error ? (
          <CenteredMessage label="Failed to load path" tone="error" />
        ) : nodes.length === 0 ? (
          <Panel>
            <PanelBody>
              <p className="text-sm text-text-tertiary">This path has no nodes.</p>
            </PanelBody>
          </Panel>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex flex-col gap-3">
              <div
                className="border border-border-strong bg-surface"
                data-testid="walkthrough-canvas"
              >
                <Canvas
                  nodes={layout.nodes}
                  edges={layout.edges}
                  height={620}
                  background="dot-grid"
                />
              </div>
              {focusedNode && (
                <ActionRow
                  focused={focusedNode}
                  isPending={setStatusMutation.isPending || clearStatusMutation.isPending}
                  error={setStatusMutation.error ?? clearStatusMutation.error}
                  onAction={(status, comment) => {
                    if (!focusedNode) return;
                    setStatusMutation.mutate({
                      nodeIdentity: focusedNode.nodeIdentity,
                      status,
                      comment,
                    });
                  }}
                  onClear={() => {
                    if (!focusedNode) return;
                    clearStatusMutation.mutate(focusedNode.nodeIdentity);
                  }}
                />
              )}
              <PathSequence nodes={nodes} focusedPosition={focusPosition} onFocus={focusOn} />
            </div>
            <ChecklistSidebar focused={focusedNode} isLoading={nodeQuery.isLoading} />
          </div>
        )}
        <FooterNav projectId={projectId} pathId={pathId} />
      </div>
    </main>
  );
}

function buildLayout(
  nodes: ReadonlyArray<PathNodeRow>,
  options: {
    focusedIdentity: string | null;
    focusedBody: string;
  },
): { nodes: CanvasNodeType[]; edges: CanvasEdgeType[] } {
  const focusedBodyLines = options.focusedBody.split('\n').slice(0, MAX_INLINE_BODY_LINES);

  const canvasNodes: CanvasNodeType[] = nodes.map((n) => {
    const isFocused = n.nodeIdentity === options.focusedIdentity;
    const classificationVariant = classificationToChipVariant(n.classification?.classification);
    const canvasStatus = canvasStatusFor(n.runtimeState);
    if (isFocused) {
      return {
        id: n.nodeIdentity,
        type: 'canvas-node',
        position: { x: 0, y: 0 },
        data: {
          variant: 'code',
          focused: true,
          figureLabel: 'FIG. A',
          classification: classificationVariant,
          status: canvasStatus,
          filePath: n.analyzed?.filePath ?? '',
          title: n.analyzed?.name ?? n.nodeIdentity,
          bodyPreview: focusedBodyLines,
        },
      };
    }
    return {
      id: n.nodeIdentity,
      type: 'canvas-node',
      position: { x: 0, y: 0 },
      data: {
        variant: 'summary',
        focused: false,
        classification: classificationVariant,
        status: canvasStatus,
        title: n.analyzed?.name ?? n.nodeIdentity.split(':').at(-1) ?? '',
        subtitle: n.analyzed?.filePath ?? '',
      },
    };
  });

  const canvasEdges: CanvasEdgeType[] = nodes.slice(1).map((n, i) => {
    const prev = nodes[i];
    return {
      id: `${prev?.nodeIdentity ?? ''}->${n.nodeIdentity}`,
      type: 'canvas-edge',
      source: prev?.nodeIdentity ?? '',
      target: n.nodeIdentity,
      data: { variant: 'resolved' },
    };
  });

  return layoutCanvas(canvasNodes, canvasEdges);
}

function canvasStatusFor(
  runtime: RuntimeState,
): 'reviewed_current' | 'reviewed_stale' | 'info_requested' | 'never_reviewed' {
  return runtime.kind;
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

function PathSequence(props: {
  nodes: ReadonlyArray<PathNodeRow>;
  focusedPosition: number;
  onFocus: (position: number) => void;
}) {
  return (
    <Panel>
      <PanelHeader tone="sunken">
        <DraftingLabel size="sm">FIG. P · PATH SEQUENCE</DraftingLabel>
        <div className="flex-1" />
        <DraftingLabel size="xs">{props.nodes.length} nodes</DraftingLabel>
      </PanelHeader>
      <ul className="divide-y divide-border" data-testid="walkthrough-sequence">
        {props.nodes.map((n) => {
          const isFocused = n.position === props.focusedPosition;
          const runtime = runtimeChipFor(n.runtimeState);
          return (
            <li key={n.position}>
              <button
                type="button"
                onClick={() => props.onFocus(n.position)}
                className={[
                  'flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-surface-sunken',
                  isFocused ? 'bg-primary-soft' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-testid={`walkthrough-sequence-row-${n.position}`}
                data-focused={isFocused ? 'true' : 'false'}
                data-runtime-state={n.runtimeState.kind}
              >
                <span className="font-mono text-xs text-text-tertiary w-8">{n.position + 1}.</span>
                {n.classification && (
                  <Chip variant={classificationToChipVariant(n.classification.classification)}>
                    {n.classification.classification.replace(/_/g, ' ').toUpperCase()}
                  </Chip>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-text-primary truncate">
                    {n.analyzed?.name ?? n.nodeIdentity}
                  </div>
                  {n.analyzed?.filePath && (
                    <div className="font-mono text-xs text-text-tertiary truncate">
                      {n.analyzed.filePath}:{n.analyzed.startLine}
                    </div>
                  )}
                </div>
                {runtime && <Chip variant={runtime.variant}>{runtime.label}</Chip>}
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function ActionRow(props: {
  focused: PathNodeRow;
  isPending: boolean;
  error: unknown;
  onAction: (status: ReviewStatus, comment: string | null) => void;
  onClear: () => void;
}) {
  const [comment, setComment] = useState('');
  const runtime = runtimeChipFor(props.focused.runtimeState);
  const currentStatus = currentStatusOf(props.focused.runtimeState);

  return (
    <Panel>
      <PanelHeader tone="sunken">
        <DraftingLabel size="sm">FIG. R · REVIEW ACTION</DraftingLabel>
        <div className="flex-1" />
        {runtime ? (
          <Chip variant={runtime.variant}>{runtime.label}</Chip>
        ) : (
          <DraftingLabel size="xs">NEVER REVIEWED</DraftingLabel>
        )}
      </PanelHeader>
      <PanelBody>
        <textarea
          name="review-comment"
          rows={2}
          placeholder="Comment (required for Request Info; optional otherwise)"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          disabled={props.isPending}
          className="block w-full resize-y border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-primary"
          data-testid="walkthrough-action-comment"
        />
        {props.error !== null && props.error !== undefined && (
          <div className="mt-2 text-sm text-error" data-testid="walkthrough-action-error">
            {String((props.error as Error).message ?? props.error)}
          </div>
        )}
      </PanelBody>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-sunken px-3.5 py-2">
        <ActionButton
          label="Approve"
          tone="approve"
          disabled={props.isPending}
          onClick={() => {
            props.onAction('approved', comment.trim() || null);
            setComment('');
          }}
          testId="walkthrough-action-approve"
        />
        <ActionButton
          label="Reject"
          tone="reject"
          disabled={props.isPending}
          onClick={() => {
            props.onAction('rejected', comment.trim() || null);
            setComment('');
          }}
          testId="walkthrough-action-reject"
        />
        <ActionButton
          label="Request info"
          tone="info"
          disabled={props.isPending || comment.trim() === ''}
          onClick={() => {
            const trimmed = comment.trim();
            if (!trimmed) return;
            props.onAction('info_requested', trimmed);
            setComment('');
          }}
          testId="walkthrough-action-info"
        />
        <div className="flex-1" />
        {currentStatus && (
          <button
            type="button"
            onClick={() => props.onClear()}
            disabled={props.isPending}
            className="border border-border-strong bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-secondary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="walkthrough-action-clear"
          >
            CLEAR
          </button>
        )}
      </div>
    </Panel>
  );
}

function ActionButton(props: {
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

function runtimeChipFor(runtime: RuntimeState): { variant: ChipVariant; label: string } | null {
  switch (runtime.kind) {
    case 'never_reviewed':
      return null;
    case 'reviewed_current':
      if (runtime.current.status === 'approved') return { variant: 'approved', label: 'APPROVED' };
      if (runtime.current.status === 'rejected') return { variant: 'rejected', label: 'REJECTED' };
      return { variant: 'info-requested', label: 'INFO REQ' };
    case 'reviewed_stale':
      return { variant: 'stale', label: 'STALE' };
    case 'info_requested':
      return { variant: 'info-requested', label: 'INFO REQ' };
  }
}

function currentStatusOf(runtime: RuntimeState): ReviewStatus | null {
  if (runtime.kind === 'reviewed_current') return runtime.current.status;
  if (runtime.kind === 'info_requested') return runtime.current.status;
  if (runtime.kind === 'reviewed_stale') return runtime.prior.status;
  return null;
}

function ChecklistSidebar(props: { focused: PathNodeRow | null; isLoading: boolean }) {
  const classification = props.focused?.classification?.classification ?? null;
  const checklist = useMemo(() => getDefaultChecklist(classification), [classification]);

  return (
    <div className="flex flex-col gap-3" data-testid="walkthrough-sidebar">
      <Panel ticks>
        <PanelHeader tone="sunken">
          <DraftingLabel size="sm" tone="primary">
            FIG. C · CHECKLIST
          </DraftingLabel>
          {props.focused?.classification && (
            <Chip variant={classificationToChipVariant(checklist.classification)}>
              {checklist.classification.replace(/_/g, ' ').toUpperCase()}
            </Chip>
          )}
        </PanelHeader>
        {props.focused?.classification?.justification && (
          <PanelBody>
            <p className="text-xs text-text-secondary">
              {props.focused.classification.justification}
            </p>
          </PanelBody>
        )}
        <ul
          className="divide-y divide-dashed divide-border"
          data-testid="walkthrough-checklist-items"
        >
          {checklist.items.map((item) => (
            <li key={item.label} className="flex items-start gap-2.5 px-3.5 py-2 text-sm">
              <UncheckedIndicator />
              <span className="flex-1 text-text-primary">{item.label}</span>
              <DraftingLabel size="xs">UNCHECKED</DraftingLabel>
            </li>
          ))}
        </ul>
        <div className="border-t border-border bg-surface-sunken px-3.5 py-2 text-xs text-text-tertiary">
          Items run when rule evaluation lands (chunk 15). Until then they show
          <span className="ml-1 font-mono uppercase tracking-wider text-text-tertiary">
            unchecked
          </span>{' '}
          — never claiming pass / fail.
        </div>
      </Panel>
      {props.isLoading && <div className="font-mono text-xs text-text-tertiary">Loading code…</div>}
    </div>
  );
}

function UncheckedIndicator() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-block h-3.5 w-3.5 flex-shrink-0 border border-dashed border-border-strong"
    />
  );
}

function FooterNav(props: { projectId: string; pathId: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <Link
        to="/project/$projectId"
        params={{ projectId: props.projectId }}
        className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
      >
        ← OVERVIEW
      </Link>
      <span className="font-mono text-xs text-text-tertiary">path: {props.pathId}</span>
    </div>
  );
}

function NoActiveCodebaseSurface() {
  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-6">
        <TitleBlock
          drawingLabel="DRAWING · WALKTHROUGH"
          title="No active codebase"
          tagline="Open one from the picker to walk a path."
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

function CenteredMessage(props: { label: string; tone?: 'tertiary' | 'error' }) {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-8">
      <div className={props.tone === 'error' ? 'text-error' : 'text-text-tertiary'}>
        {props.label}
      </div>
    </main>
  );
}
