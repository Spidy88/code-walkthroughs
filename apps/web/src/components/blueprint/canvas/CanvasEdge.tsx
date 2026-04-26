import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getBezierPath } from '@xyflow/react';
import type { CanvasEdge as CanvasEdgeType, CanvasEdgeVariant } from './types.ts';

const EDGE_STYLE: Record<CanvasEdgeVariant, React.CSSProperties> = {
  resolved: {
    stroke: 'var(--color-primary)',
    strokeWidth: 1,
  },
  unresolved: {
    stroke: 'var(--color-text-tertiary)',
    strokeWidth: 1,
    strokeDasharray: '4 4',
  },
  'handler-attached': {
    stroke: 'var(--color-primary)',
    strokeWidth: 1,
    strokeDasharray: '1 3',
  },
  'comparison-matched': {
    stroke: 'var(--color-border)',
    strokeWidth: 1,
    opacity: 0.6,
  },
  'dig-into-active': {
    stroke: 'var(--color-primary)',
    strokeWidth: 2,
  },
};

export function CanvasEdge(props: EdgeProps<CanvasEdgeType>) {
  const variant = props.data?.variant ?? 'resolved';
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
    curvature: 0.25,
  });

  const style = EDGE_STYLE[variant];

  return (
    <>
      <BaseEdge id={props.id} path={path} style={style} />
      {props.data?.callSiteLine !== undefined && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              background: 'var(--color-background)',
              padding: '1px 4px',
              border: '1px solid var(--color-border)',
            }}
            className="font-mono text-[0.625rem] uppercase tracking-wider text-text-tertiary"
          >
            line {props.data.callSiteLine}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
