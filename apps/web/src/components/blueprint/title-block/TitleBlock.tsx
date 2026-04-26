import { DraftingLabel } from '../drafting-label/DraftingLabel.tsx';

export type TitleBlockProps = {
  readonly drawingLabel: string;
  readonly title: string;
  readonly tagline?: string;
  readonly cells?: ReadonlyArray<{ readonly label: string; readonly value: string }>;
};

export function TitleBlock(props: TitleBlockProps) {
  const cells = props.cells ?? [];
  const cellWidthCols = cells.map(() => '160px').join(' ');
  return (
    <div
      className="grid border bg-surface"
      style={{
        borderColor: 'var(--color-primary)',
        gridTemplateColumns: cells.length > 0 ? `1fr ${cellWidthCols}` : '1fr',
      }}
    >
      <div className={`px-4 py-3 ${cells.length > 0 ? 'border-r border-border' : ''}`}>
        <DraftingLabel size="sm" tone="tertiary">
          {props.drawingLabel}
        </DraftingLabel>
        <div className="mt-1 text-2xl font-bold leading-tight tracking-tight text-text-primary">
          {props.title}
        </div>
        {props.tagline && <div className="mt-1 text-sm text-text-secondary">{props.tagline}</div>}
      </div>
      {cells.map((cell, index) => (
        <TitleBlockCell
          key={cell.label}
          label={cell.label}
          value={cell.value}
          last={index === cells.length - 1}
        />
      ))}
    </div>
  );
}

function TitleBlockCell(props: { label: string; value: string; last: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${props.last ? '' : 'border-r border-border'}`}>
      <DraftingLabel size="xs">{props.label}</DraftingLabel>
      <div className="mt-1 text-xs text-text-primary">{props.value}</div>
    </div>
  );
}
