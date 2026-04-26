import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Canvas,
  type CanvasEdgeType,
  CanvasLineSelectionProvider,
  type CanvasNodeType,
  Chip,
  type ChipVariant,
  ClassificationStamp,
  DraftingLabel,
  type LineRange,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
  layoutCanvas,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';
import { getDefaultChecklist } from './checklists.ts';

type ReviewStatus = 'approved' | 'rejected' | 'info_requested';

type RuntimeScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'path'; readonly pathId: string };

type ReviewSnapshot = {
  readonly status: ReviewStatus;
  readonly comment: string | null;
  readonly scope: RuntimeScope;
  readonly updatedAt: string;
};

type RuntimeState =
  | { readonly kind: 'never_reviewed' }
  | { readonly kind: 'reviewed_current'; readonly current: ReviewSnapshot }
  | { readonly kind: 'reviewed_stale'; readonly prior: ReviewSnapshot }
  | { readonly kind: 'info_requested'; readonly current: ReviewSnapshot };

type AnalyzedSummary = {
  readonly nodeIdentity: string;
  readonly filePath: string;
  readonly name: string;
  readonly kind: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly exported: boolean;
};

type ClassificationSummary = {
  readonly classification: string;
  readonly confidence: string;
  readonly justification: string | null;
  readonly source?: string;
};

type PathNodeRow = {
  readonly position: number;
  readonly nodeIdentity: string;
  readonly forkGroup: number | null;
  readonly changeKind: string | null;
  readonly cycleBackToPosition: number | null;
  readonly analyzed: AnalyzedSummary | null;
  readonly classification: ClassificationSummary | null;
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

type Callee = {
  readonly nodeIdentity: string;
  readonly callSite: { readonly line: number; readonly column: number };
  readonly analyzed: AnalyzedSummary | null;
  readonly classification: ClassificationSummary | null;
  readonly runtimeState: RuntimeState;
};

type CalleesPayload = {
  readonly callees: ReadonlyArray<Callee>;
};

type ActiveNodePayload = {
  readonly analyzed: AnalyzedSummary;
  readonly classification: ClassificationSummary | null;
  readonly body: string;
  readonly runtimeState: RuntimeState;
};

const MAX_INLINE_BODY_LINES = 14;
const DIG_EDGE_PREFIX = 'callee-edge:';

export function WalkthroughPage() {
  const { projectId, pathId } = useParams({ from: '/project/$projectId/path/$pathId' });
  const search = useSearch({ from: '/project/$projectId/path/$pathId' });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const focusPosition = search.focus ?? 0;
  const digStack = useMemo(() => search.dig ?? [], [search.dig]);
  // When the reviewer clicks a dig-into edge to a previously-reviewed
  // callee, surface the reuse prompt before actually diving in. Holds
  // the candidate plus what we know about its prior review so the
  // prompt can describe what the reviewer is about to override or
  // skip.
  const [pendingDig, setPendingDig] = useState<{
    readonly calleeIdentity: string;
    readonly name: string;
    readonly runtimeState: RuntimeState;
  } | null>(null);
  // Line selection inside the focused canvas code panel. Plain click
  // sets a 1-line range; shift-click extends from the existing anchor.
  // Cleared on focus/dig change so a stale selection from a previous
  // node doesn't anchor a comment to the wrong file.
  const [lineSelection, setLineSelection] = useState<LineRange | null>(null);

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
  const focusedPathNode = nodes.find((n) => n.position === focusPosition) ?? nodes[0] ?? null;

  // The "active" node is the one in focus on the canvas — either the
  // deepest dig-into entry, or the focused path node when no dig is open.
  const activeIdentity =
    digStack.length > 0 ? (digStack.at(-1) ?? null) : (focusedPathNode?.nodeIdentity ?? null);

  const activeNodeQuery = useQuery({
    queryKey: ['walkthrough', 'getNode', activeIdentity, pathId],
    queryFn: () =>
      activeIdentity
        ? trpcClient.walkthrough.getNode.query({ nodeIdentity: activeIdentity, pathId })
        : Promise.resolve(null),
    enabled: status.data?.active != null && activeIdentity != null,
  });

  const calleesQuery = useQuery({
    queryKey: ['walkthrough', 'getNodeCallees', activeIdentity, pathId],
    queryFn: () =>
      activeIdentity
        ? trpcClient.walkthrough.getNodeCallees.query({ nodeIdentity: activeIdentity, pathId })
        : Promise.resolve({ callees: [] }),
    enabled: status.data?.active != null && activeIdentity != null,
  });

  // Pending path_branch prep questions for this path. The walkthrough
  // injects an inline composer above the canvas when the focused node
  // is a caller with a question (spec §6.2 mid-walkthrough prep
  // injection).
  const pathBranchQuestionsQuery = useQuery({
    queryKey: ['walkthrough', 'pathBranchQuestions', pathId],
    queryFn: () => trpcClient.prep.listForPath.query({ pathId }),
    enabled: status.data?.active != null,
  });

  // All comments anchored within the active function — both
  // function-level and any line-range comments inside its body. Keyed
  // on the file/identity so it refreshes whenever the reviewer
  // focuses or digs to a different node.
  const activeFilePath = activeNodeQuery.data?.analyzed.filePath ?? null;
  const commentsQuery = useQuery({
    queryKey: ['walkthrough', 'listFunctionComments', activeIdentity, activeFilePath],
    queryFn: () =>
      activeIdentity && activeFilePath
        ? trpcClient.review.listFunctionComments.query({
            filePath: activeFilePath,
            functionIdentity: activeIdentity,
          })
        : Promise.resolve([]),
    enabled: status.data?.active != null && activeIdentity != null && activeFilePath != null,
  });

  const invalidateAll = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'getPath', pathId] }),
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'getNode'] }),
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'getNodeCallees'] }),
      ]),
    [queryClient, pathId],
  );

  const setStatusMutation = useMutation({
    mutationFn: (input: {
      nodeIdentity: string;
      status: ReviewStatus;
      comment: string | null;
      scope: 'global' | 'path';
    }) =>
      trpcClient.review.setStatus.mutate({
        nodeIdentity: input.nodeIdentity,
        status: input.status,
        comment: input.comment ?? undefined,
        pathScope: input.scope === 'path' ? pathId : undefined,
      }),
    onSettled: invalidateAll,
  });

  const clearStatusMutation = useMutation({
    mutationFn: (input: { nodeIdentity: string; scope: 'global' | 'path' }) =>
      trpcClient.review.clear.mutate({
        nodeIdentity: input.nodeIdentity,
        pathScope: input.scope === 'path' ? pathId : undefined,
      }),
    onSettled: invalidateAll,
  });

  const promoteMutation = useMutation({
    mutationFn: (nodeIdentity: string) =>
      trpcClient.review.promoteScopedApproval.mutate({ nodeIdentity, pathId }),
    onSettled: invalidateAll,
  });

  // Path-branch answer: persist the chosen callee, then re-run the
  // analysis so detectPaths re-walks the path with the answer
  // honoured. The mutation only resolves once analysis completes, so
  // the walkthrough's path query refetches against the new path_nodes.
  const answerBranchMutation = useMutation({
    mutationFn: async (input: { key: string; chosenIdentity: string }) => {
      const result = await trpcClient.prep.answerQuestion.mutate({
        key: input.key,
        answer: { kind: 'path_branch', chosenIdentity: input.chosenIdentity },
      });
      if (result.requiresReanalysis) {
        await trpcClient.analysis.run.mutate({});
      }
      return result;
    },
    onSettled: async () => {
      await Promise.all([
        invalidateAll(),
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'pathBranchQuestions'] }),
      ]);
    },
  });

  const invalidateComments = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'listComments'] }),
        queryClient.invalidateQueries({ queryKey: ['walkthrough', 'listFunctionComments'] }),
      ]),
    [queryClient],
  );

  const addCommentMutation = useMutation({
    mutationFn: (input: {
      filePath: string;
      functionIdentity: string;
      body: string;
      lineRange?: LineRange | null;
    }) =>
      trpcClient.review.addComment.mutate({
        anchor: input.lineRange
          ? {
              kind: 'line',
              filePath: input.filePath,
              functionIdentity: input.functionIdentity,
              lineStart: input.lineRange.start,
              lineEnd: input.lineRange.end,
            }
          : {
              kind: 'function',
              filePath: input.filePath,
              functionIdentity: input.functionIdentity,
            },
        body: input.body,
      }),
    onSettled: invalidateComments,
  });

  const updateCommentMutation = useMutation({
    mutationFn: (input: { id: string; body: string }) =>
      trpcClient.review.updateComment.mutate({ id: input.id, body: input.body }),
    onSettled: invalidateComments,
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (id: string) => trpcClient.review.deleteComment.mutate({ id }),
    onSettled: invalidateComments,
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
        // Advancing the path always exits any dig-into chain — the
        // reviewer is moving on, not staying inside the call tree.
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

  const digInto = useCallback(
    (calleeIdentity: string) => {
      navigate({
        to: '/project/$projectId/path/$pathId',
        params: { projectId, pathId },
        search: { focus: focusPosition, dig: [...digStack, calleeIdentity] },
      });
      setPendingDig(null);
      setLineSelection(null);
    },
    [navigate, projectId, pathId, focusPosition, digStack],
  );

  const onLineClick = useCallback((line: number, shiftKey: boolean) => {
    setLineSelection((prev: LineRange | null) => {
      // Plain click → 1-line range; if it matches the existing 1-line
      // selection, treat as a toggle and clear.
      if (!shiftKey || !prev) {
        if (prev && prev.start === line && prev.end === line) return null;
        return { start: line, end: line };
      }
      // Shift-click → extend the range to cover from the original
      // anchor (prev.start) to the new line. Swap if the new line is
      // before the anchor.
      const anchor = prev.start;
      const start = Math.min(anchor, line);
      const end = Math.max(anchor, line);
      return { start, end };
    });
  }, []);

  // Reset selection whenever the active node changes — a selection
  // anchored to a different function would commit a comment to the
  // wrong target. Biome's exhaustive-deps thinks the dep is
  // unnecessary because setLineSelection is stable, but we need the
  // *change* in identity to retrigger the effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: identity change is the intended trigger
  useEffect(() => {
    setLineSelection(null);
  }, [activeNodeQuery.data?.analyzed.nodeIdentity]);

  // The canvas onEdgeClick handler delegates here. If the callee has
  // any prior review, show the Skip / Re-examine prompt rather than
  // jumping straight in (spec §6.3 step 2).
  const requestDig = useCallback(
    (calleeIdentity: string, calleeList: ReadonlyArray<Callee>) => {
      const callee = calleeList.find((c) => c.nodeIdentity === calleeIdentity);
      if (!callee || callee.runtimeState.kind === 'never_reviewed') {
        digInto(calleeIdentity);
        return;
      }
      setPendingDig({
        calleeIdentity,
        name: callee.analyzed?.name ?? calleeIdentity.split(':').at(-1) ?? calleeIdentity,
        runtimeState: callee.runtimeState,
      });
    },
    [digInto],
  );

  const popDig = useCallback(() => {
    if (digStack.length === 0) return;
    const next = digStack.slice(0, -1);
    navigate({
      to: '/project/$projectId/path/$pathId',
      params: { projectId, pathId },
      search: next.length > 0 ? { focus: focusPosition, dig: next } : { focus: focusPosition },
    });
  }, [navigate, projectId, pathId, focusPosition, digStack]);

  // Keyboard shortcuts. j/k advance the path (and exit any dig); escape
  // pops one level out of the dig stack.
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
      } else if (event.key === 'Escape') {
        if (digStack.length > 0) {
          event.preventDefault();
          popDig();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [moveFocus, popDig, digStack.length]);

  const activeNode = (activeNodeQuery.data ?? null) as ActiveNodePayload | null;
  const callees = ((calleesQuery.data ?? { callees: [] }) as CalleesPayload).callees;
  const focusedBody = activeNode?.body ?? '';

  const layout = useMemo(
    () =>
      buildLayout({
        nodes,
        focusedPosition: focusPosition,
        digStack,
        activeNode,
        callees,
        focusedBody,
      }),
    [nodes, focusPosition, digStack, activeNode, callees, focusedBody],
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

  // Find the path_branch question that targets the *currently focused
  // path node* (not a dug-in callee). The mid-walkthrough injection
  // only fires while standing on a fork — digging into a callee is
  // already a manual override of the default.
  const branchQuestions = (pathBranchQuestionsQuery.data ??
    []) as ReadonlyArray<PathBranchPrepQuestion>;
  const inlineBranchQuestion =
    digStack.length === 0 && focusedPathNode
      ? (branchQuestions.find((q) => q.context.callerIdentity === focusedPathNode.nodeIdentity) ??
        null)
      : null;

  const comments = (commentsQuery.data ?? []) as ReadonlyArray<CommentRow>;
  const lineCommentRanges: ReadonlyArray<LineRange> = comments
    .filter(
      (c): c is CommentRow & { anchor: Extract<CommentAnchor, { kind: 'line' }> } =>
        c.anchor.kind === 'line',
    )
    .map((c) => ({ start: c.anchor.lineStart, end: c.anchor.lineEnd }));

  const activeRuntimeState: RuntimeState = activeNode?.runtimeState ??
    focusedPathNode?.runtimeState ?? { kind: 'never_reviewed' };
  const activeName = activeNode?.analyzed.name ?? focusedPathNode?.analyzed?.name ?? '';
  const activePath = activeNode?.analyzed.filePath ?? focusedPathNode?.analyzed?.filePath ?? '';

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · WALKTHROUGH"
          title={activeName || 'Walkthrough'}
          tagline={activePath}
          cells={[
            { label: 'PATH', value: pathId.slice(0, 8) },
            {
              label: 'POSITION',
              value: `${focusPosition + 1} / ${data?.path.nodeCount ?? '?'}`,
            },
            digStack.length > 0
              ? { label: 'DIG', value: `+${digStack.length}` }
              : { label: 'KEYS', value: 'j/k or ↑/↓' },
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
              <DigBreadcrumb
                focusedPathNode={focusedPathNode}
                digStack={digStack}
                callees={callees}
                onPop={popDig}
              />
              {pendingDig && (
                <ReusePrompt
                  calleeName={pendingDig.name}
                  runtimeState={pendingDig.runtimeState}
                  onSkip={() => setPendingDig(null)}
                  onReexamine={() => digInto(pendingDig.calleeIdentity)}
                />
              )}
              {inlineBranchQuestion && (
                <PathBranchPrompt
                  question={inlineBranchQuestion}
                  callees={callees}
                  isPending={answerBranchMutation.isPending}
                  error={answerBranchMutation.error}
                  onAnswer={(chosen) =>
                    answerBranchMutation.mutate({
                      key: inlineBranchQuestion.key,
                      chosenIdentity: chosen,
                    })
                  }
                />
              )}
              <CanvasLineSelectionProvider
                value={
                  activeIdentity && activeNode
                    ? {
                        nodeIdentity: activeIdentity,
                        startLine: activeNode.analyzed.startLine,
                        selectedRange: lineSelection,
                        commentRanges: lineCommentRanges,
                        onLineClick,
                      }
                    : null
                }
              >
                <div
                  className="border border-border-strong bg-surface"
                  data-testid="walkthrough-canvas"
                  data-dig-depth={digStack.length}
                >
                  <Canvas
                    nodes={layout.nodes}
                    edges={layout.edges}
                    height={620}
                    background="dot-grid"
                    reactFlowProps={{
                      onEdgeClick: (_event, edge) => {
                        if (!edge.id.startsWith(DIG_EDGE_PREFIX)) return;
                        const callee = edge.target;
                        if (callee) requestDig(callee, callees);
                      },
                    }}
                  />
                </div>
              </CanvasLineSelectionProvider>
              {lineSelection && activeIdentity && activeNode && (
                <LineRangeComposer
                  range={lineSelection}
                  isPending={addCommentMutation.isPending}
                  error={addCommentMutation.error}
                  onCancel={() => setLineSelection(null)}
                  onSubmit={(body) => {
                    addCommentMutation.mutate(
                      {
                        filePath: activeNode.analyzed.filePath,
                        functionIdentity: activeIdentity,
                        body,
                        lineRange: lineSelection,
                      },
                      { onSuccess: () => setLineSelection(null) },
                    );
                  }}
                />
              )}
              {activeIdentity && activeNode && (
                <ActionRow
                  activeIdentity={activeIdentity}
                  activeName={activeNode.analyzed.name}
                  runtimeState={activeRuntimeState}
                  isPending={
                    setStatusMutation.isPending ||
                    clearStatusMutation.isPending ||
                    promoteMutation.isPending
                  }
                  error={
                    setStatusMutation.error ?? clearStatusMutation.error ?? promoteMutation.error
                  }
                  onAction={(status, comment, scope) => {
                    setStatusMutation.mutate({
                      nodeIdentity: activeIdentity,
                      status,
                      comment,
                      scope,
                    });
                  }}
                  onClear={(scope) => {
                    clearStatusMutation.mutate({ nodeIdentity: activeIdentity, scope });
                  }}
                  onPromote={() => {
                    promoteMutation.mutate(activeIdentity);
                  }}
                />
              )}
              {activeIdentity && activeNode && (
                <CommentPanel
                  comments={comments}
                  isLoading={commentsQuery.isLoading}
                  isPending={
                    addCommentMutation.isPending ||
                    updateCommentMutation.isPending ||
                    deleteCommentMutation.isPending
                  }
                  error={
                    addCommentMutation.error ??
                    updateCommentMutation.error ??
                    deleteCommentMutation.error
                  }
                  onAdd={(body) => {
                    addCommentMutation.mutate({
                      filePath: activeNode.analyzed.filePath,
                      functionIdentity: activeIdentity,
                      body,
                    });
                  }}
                  onUpdate={(id, body) => {
                    updateCommentMutation.mutate({ id, body });
                  }}
                  onDelete={(id) => {
                    deleteCommentMutation.mutate(id);
                  }}
                />
              )}
              <PathSequence nodes={nodes} focusedPosition={focusPosition} onFocus={focusOn} />
            </div>
            <ChecklistSidebar
              focused={
                digStack.length === 0
                  ? focusedPathNode
                  : activeNode
                    ? activeNodeAsRow(activeNode)
                    : null
              }
              isLoading={activeNodeQuery.isLoading}
            />
          </div>
        )}
        <FooterNav projectId={projectId} pathId={pathId} />
      </div>
    </main>
  );
}

function activeNodeAsRow(active: ActiveNodePayload): PathNodeRow {
  return {
    position: -1,
    nodeIdentity: active.analyzed.nodeIdentity,
    forkGroup: null,
    changeKind: null,
    cycleBackToPosition: null,
    analyzed: active.analyzed,
    classification: active.classification,
    runtimeState: active.runtimeState,
  };
}

/**
 * Builds the canvas representation. Layers, in dagre rank order:
 *   1. Path sequence (linear chain, resolved edges).
 *   2. Dig stack (chained off the focused path node, dig-into-active edges).
 *   3. Callees of the active node (fan-out, dig-into-active edges).
 * The active node renders as 'code'; everyone else as 'summary'.
 */
function buildLayout(input: {
  nodes: ReadonlyArray<PathNodeRow>;
  focusedPosition: number;
  digStack: ReadonlyArray<string>;
  activeNode: ActiveNodePayload | null;
  callees: ReadonlyArray<Callee>;
  focusedBody: string;
}): { nodes: CanvasNodeType[]; edges: CanvasEdgeType[] } {
  const { nodes, focusedPosition, digStack, activeNode, callees, focusedBody } = input;
  const focusedBodyLines = focusedBody.split('\n').slice(0, MAX_INLINE_BODY_LINES);
  const activeIdentity =
    digStack.at(-1) ?? nodes.find((n) => n.position === focusedPosition)?.nodeIdentity ?? null;

  const canvasNodes: CanvasNodeType[] = [];
  const canvasEdges: CanvasEdgeType[] = [];

  // Layer 1: path sequence
  for (const n of nodes) {
    const isFocused = n.position === focusedPosition;
    const isActive = activeIdentity === n.nodeIdentity;
    const showAsCode = isActive && digStack.length === 0;
    const classificationVariant = classificationToChipVariant(n.classification?.classification);
    const canvasStatus = canvasStatusFor(n.runtimeState);
    if (showAsCode) {
      canvasNodes.push({
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
      });
    } else {
      canvasNodes.push({
        id: n.nodeIdentity,
        type: 'canvas-node',
        position: { x: 0, y: 0 },
        data: {
          variant: 'summary',
          focused: isFocused,
          classification: classificationVariant,
          status: canvasStatus,
          title: n.analyzed?.name ?? n.nodeIdentity.split(':').at(-1) ?? '',
          subtitle: n.analyzed?.filePath ?? '',
        },
      });
    }
  }

  for (let i = 1; i < nodes.length; i++) {
    const prev = nodes[i - 1];
    const cur = nodes[i];
    if (!prev || !cur) continue;
    canvasEdges.push({
      id: `path-edge:${prev.nodeIdentity}->${cur.nodeIdentity}`,
      type: 'canvas-edge',
      source: prev.nodeIdentity,
      target: cur.nodeIdentity,
      data: { variant: 'resolved' },
    });
  }

  // Layer 2: dig stack chain. Source of the first dig edge is the
  // focused path node; subsequent edges chain dig[i-1] → dig[i].
  const focusedPathNodeIdentity =
    nodes.find((n) => n.position === focusedPosition)?.nodeIdentity ?? null;
  for (let i = 0; i < digStack.length; i++) {
    const id = digStack[i];
    if (!id) continue;
    const isLast = i === digStack.length - 1;
    const showAsCode = isLast && activeNode != null;
    if (showAsCode) {
      canvasNodes.push({
        id,
        type: 'canvas-node',
        position: { x: 0, y: 0 },
        data: {
          variant: 'code',
          focused: true,
          figureLabel: `FIG. A.${i + 1}`,
          classification: classificationToChipVariant(activeNode?.classification?.classification),
          status: canvasStatusFor(
            activeNode?.runtimeState ?? ({ kind: 'never_reviewed' } as RuntimeState),
          ),
          filePath: activeNode?.analyzed.filePath ?? '',
          title: activeNode?.analyzed.name ?? id,
          bodyPreview: focusedBodyLines,
        },
      });
    } else {
      canvasNodes.push({
        id,
        type: 'canvas-node',
        position: { x: 0, y: 0 },
        data: {
          variant: 'summary',
          focused: false,
          title: id.split(':').at(-1) ?? id,
          subtitle: '',
        },
      });
    }

    const sourceId = i === 0 ? focusedPathNodeIdentity : digStack[i - 1];
    if (sourceId) {
      canvasEdges.push({
        id: `dig-edge:${sourceId}->${id}`,
        type: 'canvas-edge',
        source: sourceId,
        target: id,
        data: { variant: 'dig-into-active' },
      });
    }
  }

  // Layer 3: callees of the active node. Avoid duplicating ids already
  // used elsewhere on the canvas (path nodes, dig stack) — those would
  // collide and break xyflow's node lookup. Skip the active node from
  // its own callee list (rare self-call).
  const usedIds = new Set(canvasNodes.map((n) => n.id));
  for (const c of callees) {
    if (usedIds.has(c.nodeIdentity)) continue;
    canvasNodes.push({
      id: c.nodeIdentity,
      type: 'canvas-node',
      position: { x: 0, y: 0 },
      data: {
        variant: 'summary',
        focused: false,
        classification: classificationToChipVariant(c.classification?.classification),
        status: canvasStatusFor(c.runtimeState),
        title: c.analyzed?.name ?? c.nodeIdentity.split(':').at(-1) ?? '',
        subtitle: c.analyzed?.filePath ?? '',
      },
    });
    usedIds.add(c.nodeIdentity);

    if (activeIdentity) {
      canvasEdges.push({
        // The DIG_EDGE_PREFIX marker is what onEdgeClick checks to
        // identify a "click here to dig in" edge.
        id: `${DIG_EDGE_PREFIX}${activeIdentity}->${c.nodeIdentity}`,
        type: 'canvas-edge',
        source: activeIdentity,
        target: c.nodeIdentity,
        data: { variant: 'dig-into-active', callSiteLine: c.callSite.line },
      });
    }
  }

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

function DigBreadcrumb(props: {
  focusedPathNode: PathNodeRow | null;
  digStack: ReadonlyArray<string>;
  callees: ReadonlyArray<Callee>;
  onPop: () => void;
}) {
  if (props.digStack.length === 0) return null;

  // Resolve display names: callees query gives names for direct
  // children, but deeper levels we only know by identity. Fall back to
  // the trailing segment.
  const labelFor = (identity: string) => {
    const callee = props.callees.find((c) => c.nodeIdentity === identity);
    return callee?.analyzed?.name ?? identity.split(':').at(-1) ?? identity;
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 border border-border bg-surface-sunken px-3 py-2"
      data-testid="walkthrough-dig-breadcrumb"
    >
      <DraftingLabel size="xs">DIG</DraftingLabel>
      <span className="font-mono text-xs text-text-secondary">
        {props.focusedPathNode?.analyzed?.name ?? '?'}
      </span>
      {props.digStack.map((id, i) => {
        const depth = i;
        return (
          // The dig stack is append/pop only — identities at distinct
          // depths are functionally stable and unique in normal use.
          <span key={id} className="flex items-center gap-2">
            <span className="text-text-tertiary">→</span>
            <span
              className="font-mono text-xs text-text-primary"
              data-testid={`walkthrough-dig-crumb-${depth}`}
            >
              {labelFor(id)}
            </span>
          </span>
        );
      })}
      <div className="flex-1" />
      <button
        type="button"
        onClick={props.onPop}
        className="border border-border-strong bg-transparent px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-widest text-text-secondary hover:bg-surface"
        data-testid="walkthrough-dig-pop"
      >
        ← POP (esc)
      </button>
    </div>
  );
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
                  <>
                    <Chip variant={classificationToChipVariant(n.classification.classification)}>
                      {n.classification.classification.replace(/_/g, ' ').toUpperCase()}
                    </Chip>
                    <ClassificationStamp
                      source={n.classification.source ?? 'stage1'}
                      confidence={n.classification.confidence}
                    />
                  </>
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
  activeIdentity: string;
  activeName: string;
  runtimeState: RuntimeState;
  isPending: boolean;
  error: unknown;
  onAction: (status: ReviewStatus, comment: string | null, scope: 'global' | 'path') => void;
  onClear: (scope: 'global' | 'path') => void;
  onPromote: () => void;
}) {
  const [comment, setComment] = useState('');
  // Default to global — path-scoped is an explicit reviewer opt-in
  // (spec §8.4). Persists for the lifetime of this focused node.
  const [scope, setScope] = useState<'global' | 'path'>('global');
  const runtime = runtimeChipFor(props.runtimeState);
  const currentScope = currentScopeOf(props.runtimeState);
  const currentStatus = currentStatusOf(props.runtimeState);
  const staleHint = staleHintFor(props.runtimeState);

  return (
    <Panel>
      <PanelHeader tone="sunken">
        <DraftingLabel size="sm">FIG. R · REVIEW ACTION</DraftingLabel>
        <span
          className="font-mono text-xs text-text-secondary truncate"
          data-testid="walkthrough-action-target"
        >
          {props.activeName}
        </span>
        <div className="flex-1" />
        {staleHint && (
          <span
            className="font-mono text-[0.625rem] uppercase tracking-widest text-stale-500"
            data-testid="walkthrough-action-stale-hint"
          >
            {staleHint}
          </span>
        )}
        {currentScope === 'path' && <Chip variant="info-requested">PATH SCOPED</Chip>}
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
        <ScopeToggle scope={scope} onChange={setScope} disabled={props.isPending} />
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
            props.onAction('approved', comment.trim() || null, scope);
            setComment('');
          }}
          testId="walkthrough-action-approve"
        />
        <ActionButton
          label="Reject"
          tone="reject"
          disabled={props.isPending}
          onClick={() => {
            props.onAction('rejected', comment.trim() || null, scope);
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
            props.onAction('info_requested', trimmed, scope);
            setComment('');
          }}
          testId="walkthrough-action-info"
        />
        <div className="flex-1" />
        {currentScope === 'path' && (
          <button
            type="button"
            onClick={() => props.onPromote()}
            disabled={props.isPending}
            className="border border-info-600 bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-info-600 hover:bg-info-soft disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="walkthrough-action-promote"
          >
            PROMOTE TO GLOBAL
          </button>
        )}
        {currentStatus && (
          <button
            type="button"
            onClick={() => props.onClear(currentScope ?? 'global')}
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

function ScopeToggle(props: {
  scope: 'global' | 'path';
  onChange: (scope: 'global' | 'path') => void;
  disabled: boolean;
}) {
  return (
    <fieldset
      className="mt-2 flex items-center gap-3 text-xs text-text-secondary"
      data-testid="walkthrough-action-scope"
    >
      <DraftingLabel size="xs">APPLIES TO</DraftingLabel>
      <ScopeRadio
        value="global"
        label="Globally"
        sublabel="every encounter"
        scope={props.scope}
        onChange={props.onChange}
        disabled={props.disabled}
      />
      <ScopeRadio
        value="path"
        label="This path"
        sublabel="only here"
        scope={props.scope}
        onChange={props.onChange}
        disabled={props.disabled}
      />
    </fieldset>
  );
}

function ScopeRadio(props: {
  value: 'global' | 'path';
  label: string;
  sublabel: string;
  scope: 'global' | 'path';
  onChange: (scope: 'global' | 'path') => void;
  disabled: boolean;
}) {
  const active = props.scope === props.value;
  return (
    <label
      className={[
        'flex items-center gap-2 border px-2 py-1 cursor-pointer',
        active ? 'border-primary bg-primary-soft' : 'border-border bg-surface',
        props.disabled ? 'opacity-60 cursor-not-allowed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid={`walkthrough-action-scope-${props.value}`}
      data-active={active ? 'true' : 'false'}
    >
      <input
        type="radio"
        name="walkthrough-action-scope"
        value={props.value}
        checked={active}
        disabled={props.disabled}
        onChange={() => props.onChange(props.value)}
        className="accent-primary"
      />
      <span className="font-mono text-xs uppercase tracking-widest text-text-primary">
        {props.label}
      </span>
      <span className="font-mono text-[0.625rem] text-text-tertiary">{props.sublabel}</span>
    </label>
  );
}

type PathBranchPrepQuestion = {
  readonly key: string;
  readonly kind: 'path_branch';
  readonly context: {
    readonly kind: 'path_branch';
    readonly pathId: string;
    readonly callerIdentity: string;
    readonly candidates: readonly string[];
  };
  readonly answer: unknown;
  readonly answeredAt: string | null;
};

type CommentAnchor =
  | { readonly kind: 'file'; readonly filePath: string }
  | {
      readonly kind: 'function';
      readonly filePath: string;
      readonly functionIdentity: string;
    }
  | {
      readonly kind: 'line';
      readonly filePath: string;
      readonly functionIdentity: string;
      readonly lineStart: number;
      readonly lineEnd: number;
    };

type CommentRow = {
  readonly id: string;
  readonly anchor: CommentAnchor;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

function CommentPanel(props: {
  comments: ReadonlyArray<CommentRow>;
  isLoading: boolean;
  isPending: boolean;
  error: unknown;
  onAdd: (body: string) => void;
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <Panel>
      <PanelHeader tone="sunken">
        <DraftingLabel size="sm">FIG. M · COMMENTS</DraftingLabel>
        <div className="flex-1" />
        <DraftingLabel size="xs">{props.comments.length}</DraftingLabel>
      </PanelHeader>
      {props.comments.length > 0 && (
        <ul className="divide-y divide-dashed divide-border" data-testid="walkthrough-comment-list">
          {props.comments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              isPending={props.isPending}
              onUpdate={(body) => props.onUpdate(c.id, body)}
              onDelete={() => props.onDelete(c.id)}
            />
          ))}
        </ul>
      )}
      <PanelBody>
        <textarea
          name="comment-draft"
          rows={2}
          placeholder="Add a comment — observations, questions, follow-ups."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={props.isPending}
          className="block w-full resize-y border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-primary"
          data-testid="walkthrough-comment-draft"
        />
        {props.error !== null && props.error !== undefined && (
          <div className="mt-2 text-sm text-error" data-testid="walkthrough-comment-error">
            {String((props.error as Error).message ?? props.error)}
          </div>
        )}
      </PanelBody>
      <div className="flex items-center gap-2 border-t border-border bg-surface-sunken px-3.5 py-2">
        {props.isLoading && <span className="font-mono text-xs text-text-tertiary">Loading…</span>}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => {
            const trimmed = draft.trim();
            if (!trimmed) return;
            props.onAdd(trimmed);
            setDraft('');
          }}
          disabled={props.isPending || draft.trim() === ''}
          className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="walkthrough-comment-add"
        >
          Add comment
        </button>
      </div>
    </Panel>
  );
}

function CommentItem(props: {
  comment: CommentRow;
  isPending: boolean;
  onUpdate: (body: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.comment.body);
  const updated = props.comment.updatedAt !== props.comment.createdAt;
  const datestamp = new Date(props.comment.updatedAt).toLocaleString();
  const lineBadge =
    props.comment.anchor.kind === 'line'
      ? props.comment.anchor.lineStart === props.comment.anchor.lineEnd
        ? `L${props.comment.anchor.lineStart}`
        : `L${props.comment.anchor.lineStart}–${props.comment.anchor.lineEnd}`
      : null;

  return (
    <li
      className="flex flex-col gap-1.5 px-3.5 py-2"
      data-testid={`walkthrough-comment-item-${props.comment.id}`}
      data-anchor-kind={props.comment.anchor.kind}
    >
      {editing ? (
        <textarea
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={props.isPending}
          className="block w-full resize-y border border-border-strong bg-surface px-2 py-1 font-mono text-sm text-text-primary outline-none focus:border-primary"
          data-testid={`walkthrough-comment-edit-${props.comment.id}`}
        />
      ) : (
        <p className="whitespace-pre-wrap font-mono text-sm text-text-primary">
          {props.comment.body}
        </p>
      )}
      <div className="flex items-center gap-2 font-mono text-[0.625rem] uppercase tracking-widest text-text-tertiary">
        {lineBadge && (
          <span
            className="border border-info-600 bg-info-soft px-1.5 py-0.5 text-info-600"
            data-testid={`walkthrough-comment-line-badge-${props.comment.id}`}
          >
            {lineBadge}
          </span>
        )}
        <span>{updated ? 'edited' : 'added'}</span>
        <span>{datestamp}</span>
        <div className="flex-1" />
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                const trimmed = draft.trim();
                if (!trimmed) return;
                props.onUpdate(trimmed);
                setEditing(false);
              }}
              disabled={props.isPending || draft.trim() === ''}
              className="border border-primary bg-transparent px-2 py-0.5 text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`walkthrough-comment-save-${props.comment.id}`}
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(props.comment.body);
                setEditing(false);
              }}
              disabled={props.isPending}
              className="border border-border-strong bg-transparent px-2 py-0.5 text-text-secondary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={props.isPending}
              className="border border-border-strong bg-transparent px-2 py-0.5 text-text-secondary hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`walkthrough-comment-edit-button-${props.comment.id}`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => props.onDelete()}
              disabled={props.isPending}
              className="border border-reject-600 bg-transparent px-2 py-0.5 text-reject-600 hover:bg-reject-soft disabled:cursor-not-allowed disabled:opacity-60"
              data-testid={`walkthrough-comment-delete-${props.comment.id}`}
            >
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function PathBranchPrompt(props: {
  question: PathBranchPrepQuestion;
  callees: ReadonlyArray<Callee>;
  isPending: boolean;
  error: unknown;
  onAnswer: (chosenIdentity: string) => void;
}) {
  const { question } = props;
  // Resolve names from the callees query if available; fall back to
  // the trailing path segment so the buttons are still readable.
  const labelFor = (id: string) => {
    const callee = props.callees.find((c) => c.nodeIdentity === id);
    return callee?.analyzed?.name ?? id.split(':').at(-1) ?? id;
  };
  return (
    <div
      className="flex flex-col gap-2 border border-info-600 bg-info-soft px-3 py-2"
      data-testid="walkthrough-path-branch-prompt"
      data-question-key={question.key}
    >
      <div className="flex items-center gap-2">
        <DraftingLabel size="xs" tone="primary">
          PREP · BRANCH
        </DraftingLabel>
        <span className="font-mono text-xs text-text-primary">
          this node calls {question.context.candidates.length} resolvable functions — which should
          this path follow?
        </span>
        {props.isPending && (
          <span className="font-mono text-[0.625rem] text-text-tertiary">re-analyzing…</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {question.context.candidates.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => props.onAnswer(id)}
            disabled={props.isPending}
            className="border border-primary bg-surface px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
            data-testid={`walkthrough-path-branch-candidate-${id}`}
          >
            {labelFor(id)}
          </button>
        ))}
      </div>
      {props.error !== null && props.error !== undefined && (
        <div className="text-sm text-error" data-testid="walkthrough-path-branch-error">
          {String((props.error as Error).message ?? props.error)}
        </div>
      )}
    </div>
  );
}

function LineRangeComposer(props: {
  range: LineRange;
  isPending: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (body: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const label =
    props.range.start === props.range.end
      ? `Line ${props.range.start}`
      : `Lines ${props.range.start}–${props.range.end}`;
  return (
    <div
      className="flex flex-col gap-2 border border-info-600 bg-info-soft px-3 py-2"
      data-testid="walkthrough-line-composer"
      data-line-start={props.range.start}
      data-line-end={props.range.end}
    >
      <div className="flex items-center gap-2">
        <DraftingLabel size="xs" tone="primary">
          COMMENT ON
        </DraftingLabel>
        <span className="font-mono text-xs text-text-primary">{label}</span>
        <span className="font-mono text-[0.625rem] text-text-tertiary">
          shift-click another line to extend the range
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={props.onCancel}
          disabled={props.isPending}
          className="border border-border-strong bg-surface px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-text-secondary hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="walkthrough-line-composer-cancel"
        >
          Cancel
        </button>
      </div>
      <textarea
        rows={2}
        placeholder="What's worth flagging here?"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={props.isPending}
        className="block w-full resize-y border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-primary"
        data-testid="walkthrough-line-composer-draft"
      />
      {props.error !== null && props.error !== undefined && (
        <div className="text-sm text-error" data-testid="walkthrough-line-composer-error">
          {String((props.error as Error).message ?? props.error)}
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            const trimmed = draft.trim();
            if (!trimmed) return;
            props.onSubmit(trimmed);
            setDraft('');
          }}
          disabled={props.isPending || draft.trim() === ''}
          className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="walkthrough-line-composer-submit"
        >
          Add comment
        </button>
      </div>
    </div>
  );
}

function ReusePrompt(props: {
  calleeName: string;
  runtimeState: RuntimeState;
  onSkip: () => void;
  onReexamine: () => void;
}) {
  const chip = runtimeChipFor(props.runtimeState);
  const updatedAt =
    props.runtimeState.kind === 'reviewed_current' || props.runtimeState.kind === 'info_requested'
      ? props.runtimeState.current.updatedAt
      : props.runtimeState.kind === 'reviewed_stale'
        ? props.runtimeState.prior.updatedAt
        : null;
  const dateLabel = updatedAt ? new Date(updatedAt).toLocaleDateString() : null;

  return (
    <div
      className="flex flex-wrap items-center gap-3 border border-info-600 bg-info-soft px-3 py-2"
      data-testid="walkthrough-reuse-prompt"
    >
      <DraftingLabel size="xs" tone="primary">
        REUSE
      </DraftingLabel>
      <span className="font-mono text-xs text-text-primary">{props.calleeName}</span>
      {chip && <Chip variant={chip.variant}>{chip.label}</Chip>}
      {dateLabel && (
        <span className="font-mono text-[0.625rem] text-text-tertiary">reviewed {dateLabel}</span>
      )}
      <div className="flex-1" />
      <button
        type="button"
        onClick={props.onSkip}
        className="border border-border-strong bg-surface px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-primary hover:bg-surface-sunken"
        data-testid="walkthrough-reuse-skip"
      >
        SKIP
      </button>
      <button
        type="button"
        onClick={props.onReexamine}
        className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-700"
        data-testid="walkthrough-reuse-reexamine"
      >
        RE-EXAMINE
      </button>
    </div>
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

function staleHintFor(runtime: RuntimeState): string | null {
  if (runtime.kind !== 'reviewed_stale') return null;
  return `previously ${runtime.prior.status.replace('_', ' ')} — modified since`;
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

function currentScopeOf(runtime: RuntimeState): 'global' | 'path' | null {
  if (runtime.kind === 'reviewed_current') return runtime.current.scope.kind;
  if (runtime.kind === 'info_requested') return runtime.current.scope.kind;
  if (runtime.kind === 'reviewed_stale') return runtime.prior.scope.kind;
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
