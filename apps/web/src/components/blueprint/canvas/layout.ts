import dagre from 'dagre';
import type { CanvasEdge, CanvasNode, CanvasNodeVariant } from './types.ts';

/**
 * Default dimensions per node variant. The layout engine needs estimates so
 * it can plan ranks; the rendered node may be slightly different. Tuned to
 * the styles in CanvasNode.tsx.
 */
export const NODE_DIMENSIONS: Record<CanvasNodeVariant, { width: number; height: number }> = {
  code: { width: 320, height: 220 },
  summary: { width: 240, height: 96 },
  preamble: { width: 220, height: 76 },
  dispatcher: { width: 180, height: 64 },
};

export type LayoutOptions = {
  /** 'LR' = left-to-right horizontal tree (default). */
  readonly rankdir?: 'LR' | 'TB';
  readonly nodeSeparation?: number;
  readonly rankSeparation?: number;
};

/**
 * Computes deterministic positions for canvas nodes via dagre. Returns new
 * node objects with `position` populated; edges are returned unchanged so
 * they can be passed through.
 */
export function layoutCanvas(
  nodes: ReadonlyArray<CanvasNode>,
  edges: ReadonlyArray<CanvasEdge>,
  options: LayoutOptions = {},
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: options.rankdir ?? 'LR',
    nodesep: options.nodeSeparation ?? 32,
    ranksep: options.rankSeparation ?? 80,
    marginx: 24,
    marginy: 24,
  });

  for (const node of nodes) {
    const dims = NODE_DIMENSIONS[node.data.variant];
    graph.setNode(node.id, { width: dims.width, height: dims.height });
  }
  for (const edge of edges) {
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const positionedNodes = nodes.map((node) => {
    const layoutNode = graph.node(node.id);
    const dims = NODE_DIMENSIONS[node.data.variant];
    return {
      ...node,
      // dagre returns the center; xyflow positions are top-left
      position: {
        x: layoutNode.x - dims.width / 2,
        y: layoutNode.y - dims.height / 2,
      },
      // tell xyflow the size up front so initial layout is stable
      width: dims.width,
      height: dims.height,
    };
  });

  return { nodes: positionedNodes, edges: [...edges] };
}
