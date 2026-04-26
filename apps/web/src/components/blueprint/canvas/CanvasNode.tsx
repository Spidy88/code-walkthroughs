import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Chip } from '../chip/Chip.tsx';
import { CornerTicks } from '../corner-tick/CornerTick.tsx';
import { DraftingLabel } from '../drafting-label/DraftingLabel.tsx';
import { useCanvasLineSelection } from './CanvasLineSelectionContext.tsx';
import type { CanvasNodeStatus, CanvasNode as CanvasNodeType } from './types.ts';

const STATUS_DOT_COLOR: Record<CanvasNodeStatus, string> = {
  reviewed_current: 'var(--color-approve-600)',
  reviewed_stale: 'var(--color-stale-500)',
  info_requested: 'var(--color-info-600)',
  never_reviewed: 'var(--color-text-tertiary)',
};

const STATUS_LABEL: Record<CanvasNodeStatus, string> = {
  reviewed_current: 'REVIEWED',
  reviewed_stale: 'STALE',
  info_requested: 'INFO REQ',
  never_reviewed: 'NEW',
};

export function CanvasNode(props: NodeProps<CanvasNodeType>) {
  const { data, id } = props;
  switch (data.variant) {
    case 'code':
      return <CodeNode data={data} id={id} />;
    case 'summary':
      return <SummaryNode data={data} />;
    case 'preamble':
      return <PreambleNode data={data} />;
    case 'dispatcher':
      return <DispatcherNode data={data} />;
  }
}

function NodeHandles() {
  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: 'transparent', border: 'none', width: 1, height: 1 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: 'transparent', border: 'none', width: 1, height: 1 }}
      />
    </>
  );
}

function CodeNode(props: { data: CanvasNodeType['data']; id: string }) {
  const { data } = props;
  const selection = useCanvasLineSelection(props.id);
  return (
    <div
      className="relative flex flex-col border bg-surface text-left"
      style={{
        width: 320,
        borderColor: data.focused ? 'var(--color-primary)' : 'var(--color-border-strong)',
        boxShadow: data.focused ? '0 0 0 1px var(--color-primary)' : 'none',
      }}
    >
      {data.focused && <CornerTicks tone="primary" />}
      <NodeHandles />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-sunken px-2.5 py-1.5">
        {data.figureLabel && <DraftingLabel size="xs">{data.figureLabel}</DraftingLabel>}
        {data.classification && (
          <Chip variant={data.classification}>
            {data.classification.replace(/-/g, ' ').toUpperCase()}
          </Chip>
        )}
        {data.chips?.map((chip) => (
          <Chip key={chip.label} variant={chip.variant}>
            {chip.label}
          </Chip>
        ))}
        {data.status && (
          <span
            aria-label={STATUS_LABEL[data.status]}
            className="ml-auto font-mono text-[0.625rem] uppercase tracking-wider text-text-tertiary"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <span
              aria-hidden="true"
              style={{ width: 6, height: 6, background: STATUS_DOT_COLOR[data.status] }}
            />
            {STATUS_LABEL[data.status]}
          </span>
        )}
      </div>
      <div className="px-2.5 py-2">
        {data.filePath && (
          <div className="font-mono text-[0.6875rem] text-text-tertiary">{data.filePath}</div>
        )}
        <div className="font-mono text-sm font-semibold text-text-primary">{data.title}</div>
        {data.subtitle && <div className="mt-1 text-xs text-text-secondary">{data.subtitle}</div>}
      </div>
      {data.bodyPreview && data.bodyPreview.length > 0 && (
        <CodeBody
          lines={data.bodyPreview}
          startLine={selection?.startLine ?? null}
          selectedRange={selection?.selectedRange ?? null}
          commentRanges={selection?.commentRanges ?? []}
          onLineClick={selection?.onLineClick ?? null}
        />
      )}
      {data.callsTo && (
        <div className="flex items-center gap-1.5 border-t border-border bg-surface-sunken px-2.5 py-1">
          <DraftingLabel size="xs">CALLS →</DraftingLabel>
          <span className="font-mono text-xs font-semibold text-text-primary">{data.callsTo}</span>
        </div>
      )}
    </div>
  );
}

function CodeBody(props: {
  lines: ReadonlyArray<string>;
  startLine: number | null;
  selectedRange: { readonly start: number; readonly end: number } | null;
  commentRanges: ReadonlyArray<{ readonly start: number; readonly end: number }>;
  onLineClick: ((line: number, shiftKey: boolean) => void) | null;
}) {
  // If we don't know the absolute start line, fall back to the static
  // <pre> render — gutter line numbers would lie. Keeps the old path
  // intact for non-walkthrough surfaces (showcase, etc.).
  if (props.startLine === null || props.onLineClick === null) {
    return (
      <div className="border-t border-dashed border-border px-2.5 py-1.5">
        <pre className="overflow-x-auto whitespace-pre font-mono text-[0.6875rem] leading-[1.55] text-text-primary">
          {props.lines.join('\n')}
        </pre>
      </div>
    );
  }
  const startLine = props.startLine;
  const onLineClick = props.onLineClick;
  return (
    <div
      className="border-t border-dashed border-border"
      data-testid="canvas-code-body"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {props.lines.map((text, idx) => {
        const lineNumber = startLine + idx;
        const inSelection =
          props.selectedRange !== null &&
          lineNumber >= props.selectedRange.start &&
          lineNumber <= props.selectedRange.end;
        const inComment = props.commentRanges.some(
          (r) => lineNumber >= r.start && lineNumber <= r.end,
        );
        return (
          <div
            // Source-line numbers within a function are unique within
            // this body, so they make a stable key.
            key={lineNumber}
            className="flex items-stretch font-mono text-[0.6875rem] leading-[1.55]"
            style={{
              background: inSelection ? 'var(--color-primary-soft)' : undefined,
            }}
            data-line={lineNumber}
            data-in-selection={inSelection ? 'true' : 'false'}
            data-in-comment={inComment ? 'true' : 'false'}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLineClick(lineNumber, e.shiftKey);
              }}
              className="border-r border-border px-1.5 text-text-tertiary hover:bg-primary-soft hover:text-primary"
              style={{
                background: inComment ? 'var(--color-info-soft)' : undefined,
                color: inComment ? 'var(--color-info-600)' : undefined,
                minWidth: 28,
                textAlign: 'right',
              }}
              aria-label={`Select line ${lineNumber}${inComment ? ' (has comment)' : ''}`}
              data-testid={`canvas-line-gutter-${lineNumber}`}
            >
              {lineNumber}
            </button>
            <pre className="overflow-x-auto whitespace-pre px-2.5 text-text-primary">{text}</pre>
          </div>
        );
      })}
    </div>
  );
}

function SummaryNode(props: { data: CanvasNodeType['data'] }) {
  const { data } = props;
  return (
    <div
      className="relative flex flex-col border bg-surface px-2.5 py-2 text-left"
      style={{
        width: 240,
        borderColor: data.focused ? 'var(--color-primary)' : 'var(--color-border-strong)',
        boxShadow: data.focused ? '0 0 0 1px var(--color-primary)' : 'none',
      }}
    >
      {data.focused && <CornerTicks tone="primary" />}
      <NodeHandles />
      <div className="flex items-center gap-1.5">
        {data.classification && (
          <Chip variant={data.classification}>
            {data.classification.replace(/-/g, ' ').toUpperCase()}
          </Chip>
        )}
        <div className="flex-1" />
        {data.status && (
          <span
            aria-hidden="true"
            style={{ width: 6, height: 6, background: STATUS_DOT_COLOR[data.status] }}
          />
        )}
      </div>
      <div className="mt-1 font-mono text-xs font-semibold text-text-primary truncate">
        {data.title}
      </div>
      {data.subtitle && (
        <div className="mt-0.5 text-[0.6875rem] text-text-tertiary truncate">{data.subtitle}</div>
      )}
    </div>
  );
}

function PreambleNode(props: { data: CanvasNodeType['data'] }) {
  const { data } = props;
  return (
    <div
      className="relative flex flex-col border-dashed border bg-surface-sunken px-2.5 py-1.5 text-left opacity-80"
      style={{
        width: 220,
        borderColor: 'var(--color-border-strong)',
      }}
    >
      <NodeHandles />
      <DraftingLabel size="xs">PREAMBLE</DraftingLabel>
      <div className="mt-0.5 font-mono text-xs font-semibold text-text-secondary truncate">
        {data.title}
      </div>
      {data.subtitle && (
        <div className="text-[0.6875rem] text-text-tertiary truncate">{data.subtitle}</div>
      )}
    </div>
  );
}

function DispatcherNode(props: { data: CanvasNodeType['data'] }) {
  const { data } = props;
  return (
    <div
      className="relative flex flex-col items-center border bg-surface px-2 py-1 text-center"
      style={{
        width: 180,
        borderColor: 'var(--color-primary)',
      }}
    >
      <NodeHandles />
      <DraftingLabel size="xs" tone="primary">
        DISPATCHER
      </DraftingLabel>
      <div className="font-mono text-xs font-semibold text-text-primary truncate">{data.title}</div>
    </div>
  );
}
