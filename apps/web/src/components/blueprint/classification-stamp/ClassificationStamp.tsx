/**
 * Tiny source/confidence stamp for classification chips. Spec §5.2:
 * the reviewer can always see whether a classification came from
 * deterministic stage-1 signals, an LLM stage-2 pass, or was
 * supplied via the prep queue, plus the confidence the analyzer (or
 * reviewer) has in it.
 */
type Source = 'stage1' | 'stage2' | 'prep' | string;
type Confidence = 'high' | 'medium' | 'low' | 'none' | string;

const SOURCE_LABEL: Record<string, string> = {
  stage1: 'S1',
  stage2: 'S2',
  prep: 'REV',
};

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'text-approve-600',
  medium: 'text-text-secondary',
  low: 'text-info-600',
  none: 'text-text-tertiary',
};

export type ClassificationStampProps = {
  readonly source: Source;
  readonly confidence: Confidence;
  readonly testId?: string;
};

export function ClassificationStamp(props: ClassificationStampProps) {
  const sourceLabel = SOURCE_LABEL[props.source] ?? props.source.toUpperCase();
  const confidenceTone = CONFIDENCE_TONE[props.confidence] ?? 'text-text-tertiary';
  const confidenceLetter = props.confidence.charAt(0).toUpperCase();
  return (
    <span
      className="inline-flex items-center gap-0.5 font-mono text-[0.625rem] uppercase tracking-widest text-text-tertiary"
      data-testid={props.testId}
      data-source={props.source}
      data-confidence={props.confidence}
      title={`source: ${props.source}  ·  confidence: ${props.confidence}`}
    >
      <span>{sourceLabel}</span>
      <span aria-hidden="true">·</span>
      <span className={confidenceTone}>{confidenceLetter}</span>
    </span>
  );
}
