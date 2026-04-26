import type { Edge, Node } from '@xyflow/react';
import type { ChipVariant } from '../chip/chip-variants.ts';

export type CanvasNodeStatus =
  | 'reviewed_current'
  | 'reviewed_stale'
  | 'info_requested'
  | 'never_reviewed';

export type CanvasNodeVariant = 'code' | 'summary' | 'preamble' | 'dispatcher';

/**
 * Data attached to a canvas node. The variant determines how the node renders;
 * the rest is content per variant.
 */
export type CanvasNodeData = {
  readonly variant: CanvasNodeVariant;
  readonly focused?: boolean;
  readonly classification?: ChipVariant;
  readonly status?: CanvasNodeStatus;
  readonly filePath?: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly bodyPreview?: ReadonlyArray<string>;
  readonly callsTo?: string;
  readonly chips?: ReadonlyArray<{ readonly variant: ChipVariant; readonly label: string }>;
  readonly figureLabel?: string;
};

export type CanvasEdgeVariant =
  | 'resolved'
  | 'unresolved'
  | 'handler-attached'
  | 'comparison-matched'
  | 'dig-into-active';

export type CanvasEdgeData = {
  readonly variant: CanvasEdgeVariant;
  readonly callSiteLine?: number;
};

export type CanvasNode = Node<CanvasNodeData, 'canvas-node'>;
export type CanvasEdge = Edge<CanvasEdgeData, 'canvas-edge'>;
