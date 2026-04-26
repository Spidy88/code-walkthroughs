import type { ReactNode } from 'react';
import { CornerTicks } from '../corner-tick/CornerTick.tsx';

export type PanelProps = {
  readonly children: ReactNode;
  readonly ticks?: boolean;
  readonly tone?: 'default' | 'sunken';
  readonly className?: string;
};

const TONE_BG = {
  default: 'bg-surface',
  sunken: 'bg-surface-sunken',
} as const;

export function Panel(props: PanelProps) {
  const tone = props.tone ?? 'default';
  return (
    <div
      className={['relative border border-border-strong', TONE_BG[tone], props.className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {props.ticks && <CornerTicks tone="primary" />}
      {props.children}
    </div>
  );
}

export type PanelHeaderProps = {
  readonly children: ReactNode;
  readonly tone?: 'default' | 'sunken';
  readonly className?: string;
};

export function PanelHeader(props: PanelHeaderProps) {
  const tone = props.tone ?? 'default';
  return (
    <div
      className={[
        'flex items-center gap-2.5 border-b border-border px-3.5 py-2.5',
        TONE_BG[tone],
        props.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </div>
  );
}

export type PanelBodyProps = {
  readonly children: ReactNode;
  readonly padless?: boolean;
  readonly className?: string;
};

export function PanelBody(props: PanelBodyProps) {
  return (
    <div
      className={[props.padless ? '' : 'px-3.5 py-3', props.className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </div>
  );
}

export type PanelFooterProps = {
  readonly children: ReactNode;
  readonly tone?: 'default' | 'sunken';
  readonly className?: string;
};

export function PanelFooter(props: PanelFooterProps) {
  const tone = props.tone ?? 'sunken';
  return (
    <div
      className={[
        'flex items-center gap-2.5 border-t border-border px-3.5 py-2',
        TONE_BG[tone],
        props.className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {props.children}
    </div>
  );
}
