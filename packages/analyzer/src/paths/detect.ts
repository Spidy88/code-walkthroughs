import type { ParseOutput } from '@cw/adapters';
import type { DetectedPath, EntryPoint, NodeIdentity, PathNode } from '@cw/shared';
import { ulid } from '@cw/shared';

export type PathDetectionInput = {
  readonly entryPoints: readonly EntryPoint[];
  readonly files: readonly ParseOutput[];
  readonly projectId: string;
  readonly depthLimit?: number;
  readonly signal?: AbortSignal;
};

export type PathDetectionOutput = {
  readonly paths: readonly DetectedPath[];
  readonly pathNodes: readonly PathNode[];
};

const DEFAULT_DEPTH = 8;

export function detectPaths(input: PathDetectionInput): PathDetectionOutput {
  const depth = input.depthLimit ?? DEFAULT_DEPTH;

  const callEdgesByCaller = new Map<
    NodeIdentity,
    readonly { calleeIdentity: NodeIdentity | null }[]
  >();
  for (const file of input.files) {
    for (const edge of file.callEdges) {
      const list = callEdgesByCaller.get(edge.callerIdentity) ?? [];
      callEdgesByCaller.set(edge.callerIdentity, [
        ...list,
        { calleeIdentity: edge.calleeIdentity },
      ]);
    }
  }

  const knownNodes = new Set<NodeIdentity>();
  for (const file of input.files) {
    for (const node of file.nodes) knownNodes.add(node.identity);
  }

  const paths: DetectedPath[] = [];
  const pathNodes: PathNode[] = [];

  for (const entry of input.entryPoints) {
    if (input.signal?.aborted) input.signal.throwIfAborted();

    const pathId = ulid();
    const visited = new Set<NodeIdentity>();
    const ordered: NodeIdentity[] = [];
    const cycles = new Map<NodeIdentity, number>();

    let cursor: NodeIdentity | null = entry.nodeIdentity;
    let position = 0;
    let maxDepth = 0;

    while (cursor && position < depth) {
      maxDepth = position;
      if (visited.has(cursor)) {
        cycles.set(cursor, ordered.indexOf(cursor));
        break;
      }
      visited.add(cursor);
      ordered.push(cursor);

      const edges: readonly { calleeIdentity: NodeIdentity | null }[] =
        callEdgesByCaller.get(cursor) ?? [];
      const next = edges
        .map((e: { calleeIdentity: NodeIdentity | null }) => e.calleeIdentity)
        .find((id: NodeIdentity | null): id is NodeIdentity => id !== null && knownNodes.has(id));

      cursor = next ?? null;
      position += 1;
    }

    paths.push({
      id: pathId,
      entryPointId: entry.id,
      projectId: input.projectId,
      nodeCount: ordered.length,
      maxDepth,
      category: null,
      categoryOrder: null,
    });

    ordered.forEach((nodeIdentity, index) => {
      pathNodes.push({
        pathId,
        position: index,
        nodeIdentity,
        forkGroup: null,
        changeKind: null,
        cycleBackToPosition: cycles.get(nodeIdentity) ?? null,
      });
    });
  }

  return { paths, pathNodes };
}
