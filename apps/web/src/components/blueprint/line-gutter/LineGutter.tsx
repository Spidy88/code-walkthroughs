import type { ReactNode } from 'react';

export type LineState = 'unchanged' | 'new' | 'modified' | 'removed';

export type LineGutterProps = {
  readonly lineNumber: number;
  readonly state?: LineState;
  readonly children: ReactNode;
};

const STATE_STRIPE_BG = {
  unchanged: 'transparent',
  new: 'var(--color-approve-500)',
  modified: 'var(--color-modified-500)',
  removed: 'var(--color-deleted-500)',
} as const;

const STATE_ROW_BG = {
  unchanged: 'transparent',
  new: 'var(--color-approve-soft)',
  modified: 'var(--color-warn-soft)',
  removed: 'var(--color-reject-soft)',
} as const;

export function LineGutter(props: LineGutterProps) {
  const state = props.state ?? 'unchanged';
  return (
    <div
      className="grid items-center font-mono text-sm leading-[1.55]"
      style={{
        gridTemplateColumns: '3px 44px 1fr',
        background: STATE_ROW_BG[state],
      }}
    >
      <span
        aria-hidden="true"
        className="ml-px h-full"
        style={{ width: 2, background: STATE_STRIPE_BG[state] }}
      />
      <span aria-hidden="true" className="select-none text-right pr-2.5 text-xs text-text-tertiary">
        {props.lineNumber}
      </span>
      <span className="overflow-x-auto whitespace-pre pr-3.5 text-text-primary">
        {props.children || ' '}
      </span>
    </div>
  );
}

export type LineGutterBlockProps = {
  readonly lines: ReadonlyArray<{
    readonly number: number;
    readonly text: string;
    readonly state?: LineState;
  }>;
};

export function LineGutterBlock(props: LineGutterBlockProps) {
  return (
    <div className="py-1.5">
      {props.lines.map((line) => (
        <LineGutter
          key={line.number}
          lineNumber={line.number}
          {...(line.state ? { state: line.state } : {})}
        >
          {line.text}
        </LineGutter>
      ))}
    </div>
  );
}
