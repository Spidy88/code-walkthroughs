export type CornerTickPosition = 'tl' | 'tr' | 'bl' | 'br';

export type CornerTickProps = {
  readonly position: CornerTickPosition;
  readonly tone?: 'primary' | 'border-strong';
  readonly size?: number;
};

const POSITION_STYLE: Record<CornerTickPosition, React.CSSProperties> = {
  tl: { top: -1, left: -1, borderTopWidth: 1, borderLeftWidth: 1 },
  tr: { top: -1, right: -1, borderTopWidth: 1, borderRightWidth: 1 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 1, borderLeftWidth: 1 },
  br: { bottom: -1, right: -1, borderBottomWidth: 1, borderRightWidth: 1 },
};

const TONE_COLOR = {
  primary: 'var(--color-primary)',
  'border-strong': 'var(--color-border-strong)',
} as const;

export function CornerTick(props: CornerTickProps) {
  const tone = props.tone ?? 'primary';
  const size = props.size ?? 10;
  return (
    <span
      aria-hidden="true"
      className="absolute pointer-events-none"
      style={{
        ...POSITION_STYLE[props.position],
        width: size,
        height: size,
        borderColor: TONE_COLOR[tone],
        borderStyle: 'solid',
      }}
    />
  );
}

export type CornerTicksProps = {
  readonly tone?: 'primary' | 'border-strong';
  readonly size?: number;
};

/**
 * Renders all four corner ticks in one shot. Use inside a positioned
 * (relative/absolute) container; the ticks are absolutely positioned
 * to overlap the parent's 1px border at exactly the corner.
 */
export function CornerTicks(props: CornerTicksProps) {
  const passthrough = {
    ...(props.tone !== undefined ? { tone: props.tone } : {}),
    ...(props.size !== undefined ? { size: props.size } : {}),
  };
  return (
    <>
      <CornerTick position="tl" {...passthrough} />
      <CornerTick position="tr" {...passthrough} />
      <CornerTick position="bl" {...passthrough} />
      <CornerTick position="br" {...passthrough} />
    </>
  );
}
