import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowProps,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMemo } from 'react';
import { CanvasEdge as CanvasEdgeComponent } from './CanvasEdge.tsx';
import { CanvasNode as CanvasNodeComponent } from './CanvasNode.tsx';
import type { CanvasEdge, CanvasNode } from './types.ts';

export type CanvasProps = {
  readonly nodes: ReadonlyArray<CanvasNode>;
  readonly edges: ReadonlyArray<CanvasEdge>;
  readonly height?: number | string;
  readonly minimap?: boolean;
  readonly controls?: boolean;
  readonly background?: 'dot-grid' | 'none';
  /** Override default xyflow props if needed (e.g. fitView, panOnScroll). */
  readonly reactFlowProps?: Partial<ReactFlowProps>;
};

const NODE_TYPES = {
  'canvas-node': CanvasNodeComponent,
};

const EDGE_TYPES = {
  'canvas-edge': CanvasEdgeComponent,
};

export function Canvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner(props: CanvasProps) {
  const height = props.height ?? 480;
  const nodes = useMemo(() => [...props.nodes], [props.nodes]);
  const edges = useMemo(() => [...props.edges], [props.edges]);

  return (
    <div
      className="relative border border-border-strong bg-background"
      style={{ height, width: '100%' }}
      data-testid="blueprint-canvas"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'canvas-edge' }}
        {...props.reactFlowProps}
      >
        {props.background !== 'none' && (
          <Background
            variant={BackgroundVariant.Dots}
            gap={8}
            size={0.5}
            color="rgba(10, 90, 128, 0.18)"
          />
        )}
        {props.controls !== false && (
          <Controls
            position="bottom-left"
            showInteractive={false}
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-strong)',
            }}
          />
        )}
        {props.minimap !== false && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            maskColor="rgba(10, 90, 128, 0.05)"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-strong)',
            }}
            nodeStrokeColor="var(--color-border-strong)"
            nodeColor={(node) => {
              const data = (node as unknown as CanvasNode).data;
              if (data.focused) return 'var(--color-primary)';
              if (data.variant === 'dispatcher') return 'var(--color-primary-100)';
              if (data.variant === 'preamble') return 'var(--color-surface-sunken)';
              return 'var(--color-paper-150)';
            }}
          />
        )}
      </ReactFlow>
    </div>
  );
}
