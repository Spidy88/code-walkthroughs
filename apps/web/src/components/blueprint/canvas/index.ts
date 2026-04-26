export { Canvas, type CanvasProps } from './Canvas.tsx';
export { CanvasNode } from './CanvasNode.tsx';
export { CanvasEdge } from './CanvasEdge.tsx';
export { PairedCanvas, type PairedCanvasProps } from './PairedCanvas.tsx';
export { layoutCanvas, NODE_DIMENSIONS, type LayoutOptions } from './layout.ts';
export {
  CanvasLineSelectionProvider,
  useCanvasLineSelection,
  type CanvasLineSelection,
  type LineRange,
} from './CanvasLineSelectionContext.tsx';
export type {
  CanvasNode as CanvasNodeType,
  CanvasEdge as CanvasEdgeType,
  CanvasNodeData,
  CanvasNodeStatus,
  CanvasNodeVariant,
  CanvasEdgeData,
  CanvasEdgeVariant,
} from './types.ts';
