import { DraftingLabel } from '../drafting-label/DraftingLabel.tsx';
import { Canvas, type CanvasProps } from './Canvas.tsx';

export type PairedCanvasProps = {
  readonly base: Omit<CanvasProps, 'minimap'>;
  readonly head: Omit<CanvasProps, 'minimap'>;
  readonly baseLabel?: string;
  readonly headLabel?: string;
  readonly height?: number | string;
};

/**
 * Two canvases side by side for path-delta comparison. Each side has its
 * own xyflow instance; layout is independent. Per the design spec
 * (§4.4 / §8) we default to a single shared minimap, but for v1 we keep
 * each canvas's controls / minimap independent — synchronization is a
 * future iteration.
 */
export function PairedCanvas(props: PairedCanvasProps) {
  const height = props.height ?? 480;
  return (
    <div className="grid gap-3 lg:grid-cols-2" data-testid="blueprint-paired-canvas">
      <PairedSide label={props.baseLabel ?? 'BASE'} canvas={props.base} height={height} />
      <PairedSide label={props.headLabel ?? 'HEAD'} canvas={props.head} height={height} />
    </div>
  );
}

function PairedSide(props: {
  label: string;
  canvas: Omit<CanvasProps, 'minimap'>;
  height: number | string;
}) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border border-border-strong border-b-0 bg-surface-sunken px-3 py-1.5">
        <DraftingLabel size="sm" tone="primary">
          {props.label}
        </DraftingLabel>
      </div>
      <Canvas {...props.canvas} height={props.height} minimap={false} />
    </div>
  );
}
