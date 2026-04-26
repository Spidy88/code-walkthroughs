import type { ReactNode } from 'react';

export type DraftingLabelProps = {
  readonly children: ReactNode;
  readonly size?: 'xs' | 'sm';
  readonly tone?: 'tertiary' | 'primary';
  readonly weight?: 'semibold' | 'bold';
  readonly className?: string;
};

const TONE_CLASS = {
  tertiary: 'text-text-tertiary',
  primary: 'text-primary',
} as const;

const WEIGHT_CLASS = {
  semibold: 'font-semibold',
  bold: 'font-bold',
} as const;

const SIZE_CLASS = {
  xs: 'text-xs tracking-wider',
  sm: 'text-xs tracking-widest',
} as const;

export function DraftingLabel(props: DraftingLabelProps) {
  const size = props.size ?? 'sm';
  const tone = props.tone ?? 'tertiary';
  const weight = props.weight ?? 'semibold';

  return (
    <span
      className={[
        'font-mono uppercase',
        SIZE_CLASS[size],
        TONE_CLASS[tone],
        WEIGHT_CLASS[weight],
        props.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </span>
  );
}
