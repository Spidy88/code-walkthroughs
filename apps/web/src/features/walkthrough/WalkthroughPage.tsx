import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo } from 'react';
import {
  Canvas,
  type CanvasEdgeType,
  type CanvasNodeType,
  Chip,
  type ChipVariant,
  DraftingLabel,
  LineGutterBlock,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
  layoutCanvas,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';

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

export function WalkthroughPage() {
  const { projectId, pathId } = useParams({ from: '/project/$projectId/path/$pathId' });
  const search = useSearch({ from: '/project/$projectId/path/$pathId' });
  const navigate = useNavigate();
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
        nodes[0]?.position ?? 1,
        Math.min(nodes[nodes.length - 1]?.position ?? 1, focusPosition + delta),
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

  const layout = useMemo(
    () => buildLayout(nodes, focusedNode?.nodeIdentity ?? null, focusOn),
    [nodes, focusedNode, focusOn],
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
      <div className="mx-auto max-w-[1280px] space-y-4">
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="flex flex-col gap-3">
              <div
                className="border border-border-strong bg-surface"
                data-testid="walkthrough-canvas"
              >
                <Canvas
                  nodes={layout.nodes}
                  edges={layout.edges}
                  height={520}
                  background="dot-grid"
                />
              </div>
              <PathSequence nodes={nodes} focusedPosition={focusPosition} onFocus={focusOn} />
            </div>
            <FocusedNodePanel
              focused={focusedNode}
              body={nodeQuery.data?.body ?? ''}
              isLoading={nodeQuery.isLoading}
            />
          </div>
        )}
        <FooterNav projectId={projectId} pathId={pathId} />
      </div>
    </main>
  );
}

function buildLayout(
  nodes: ReadonlyArray<PathNodeRow>,
  focusedIdentity: string | null,
  onFocus: (position: number) => void,
): { nodes: CanvasNodeType[]; edges: CanvasEdgeType[] } {
  const canvasNodes: CanvasNodeType[] = nodes.map((n) => ({
    id: n.nodeIdentity,
    type: 'canvas-node',
    position: { x: 0, y: 0 },
    data: {
      variant: 'summary',
      focused: n.nodeIdentity === focusedIdentity,
      classification: classificationToChipVariant(n.classification?.classification),
      title: n.analyzed?.name ?? n.nodeIdentity.split(':').at(-1) ?? '',
      subtitle: n.analyzed?.filePath ?? '',
    },
  }));

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

  const out = layoutCanvas(canvasNodes, canvasEdges);

  // Add click handlers (via the data — we can't pass closures to xyflow nodes
  // through the controlled-positions helper, so we expose onFocus via the
  // PathSequence list below the canvas instead).
  void onFocus;

  return out;
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
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function FocusedNodePanel(props: {
  focused: PathNodeRow | null;
  body: string;
  isLoading: boolean;
}) {
  if (!props.focused) {
    return (
      <Panel>
        <PanelBody>
          <p className="text-sm text-text-tertiary">No node focused.</p>
        </PanelBody>
      </Panel>
    );
  }
  const { focused } = props;
  const lines = props.body.split('\n');
  const startLine = focused.analyzed?.startLine ?? 1;

  return (
    <div className="relative">
      <Panel ticks>
        <PanelHeader tone="sunken">
          <DraftingLabel size="sm" tone="primary">
            FIG. F · FOCUSED NODE
          </DraftingLabel>
          {focused.classification && (
            <Chip variant={classificationToChipVariant(focused.classification.classification)}>
              {focused.classification.classification.replace(/_/g, ' ').toUpperCase()}
            </Chip>
          )}
        </PanelHeader>
        <PanelBody>
          <div className="font-mono text-xs text-text-tertiary truncate">
            {focused.analyzed?.filePath ?? '—'}
          </div>
          <div className="mt-1 font-mono text-base font-semibold text-text-primary">
            {focused.analyzed?.name ?? focused.nodeIdentity}
          </div>
          {focused.classification?.justification && (
            <p className="mt-2 text-xs text-text-secondary">
              {focused.classification.justification}
            </p>
          )}
        </PanelBody>
        {props.isLoading ? (
          <PanelBody>
            <div className="text-sm text-text-secondary">Loading code…</div>
          </PanelBody>
        ) : props.body ? (
          <div className="border-t border-dashed border-border">
            <LineGutterBlock
              lines={lines.map((text, i) => ({
                number: startLine + i,
                text,
              }))}
            />
          </div>
        ) : (
          <PanelBody>
            <div className="text-sm text-text-tertiary">No code body available.</div>
          </PanelBody>
        )}
      </Panel>
    </div>
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
