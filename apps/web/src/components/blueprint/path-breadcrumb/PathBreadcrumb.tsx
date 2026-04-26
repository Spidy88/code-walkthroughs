import { Children, type ReactElement, type ReactNode, isValidElement } from 'react';
import { DraftingLabel } from '../drafting-label/DraftingLabel.tsx';

export type PathBreadcrumbProps = {
  readonly children: ReactNode;
  readonly leadingLabel?: string;
  readonly className?: string;
};

export function PathBreadcrumb(props: PathBreadcrumbProps) {
  const segments = Children.toArray(props.children).filter(
    (child): child is ReactElement<SegmentProps> => isValidElement(child) && child.type === Segment,
  );

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-1.5 border-b border-border bg-surface-sunken px-3.5 py-1.5',
        'font-mono text-xs',
        props.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.leadingLabel && (
        <DraftingLabel size="xs" className="mr-1">
          {props.leadingLabel}
        </DraftingLabel>
      )}
      {segments.map((segment, index) => (
        <SegmentWithSeparator
          key={segment.key ?? index}
          segment={segment}
          isLast={index === segments.length - 1}
        />
      ))}
    </div>
  );
}

function SegmentWithSeparator(props: {
  segment: ReactElement<SegmentProps>;
  isLast: boolean;
}) {
  return (
    <>
      {props.segment}
      {!props.isLast && (
        <span aria-hidden="true" className="text-primary">
          →
        </span>
      )}
    </>
  );
}

type SegmentProps = {
  readonly children: ReactNode;
  readonly current?: boolean;
};

function Segment(props: SegmentProps) {
  return (
    <span className={props.current ? 'font-semibold text-text-primary' : 'text-text-secondary'}>
      {props.children}
    </span>
  );
}

PathBreadcrumb.Segment = Segment;
