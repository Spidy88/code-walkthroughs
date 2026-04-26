import type { ReactNode } from 'react';
import { CHIP_VARIANTS, type ChipVariant } from './chip-variants.ts';

export type ChipProps = {
  readonly children: ReactNode;
  readonly variant: ChipVariant;
  readonly hideDot?: boolean;
  readonly className?: string;
};

export function Chip(props: ChipProps) {
  const style = CHIP_VARIANTS[props.variant];
  const hideDot = props.hideDot ?? style.defaultHideDot;

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 px-2 py-0.5',
        'font-mono text-xs font-semibold uppercase tracking-widest',
        'border whitespace-nowrap',
        props.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        color: style.fg,
        background: style.bg,
        borderColor: style.fg,
      }}
    >
      {!hideDot && (
        <span
          aria-hidden="true"
          className="inline-block"
          style={{ width: 6, height: 6, background: style.fg }}
        />
      )}
      {props.children}
    </span>
  );
}
