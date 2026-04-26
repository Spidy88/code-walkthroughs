export type ChipVariant =
  | 'approved'
  | 'rejected'
  | 'info-requested'
  | 'new'
  | 'modified'
  | 'stale'
  | 'never-reviewed'
  | 'contract-change'
  | 'indirect-impact'
  | 'cosmetic'
  | 'route-handler'
  | 'service'
  | 'client'
  | 'repository'
  | 'helper'
  | 'middleware'
  | 'component'
  | 'page'
  | 'hook'
  | 'config'
  | 'script'
  | 'seed'
  | 'fixture'
  | 'test'
  | 'type-only'
  | 'unclassified';

export type ChipStyle = {
  readonly fg: string;
  readonly bg: string;
  readonly defaultHideDot: boolean;
};

const STATE: ChipStyle = {
  fg: 'var(--color-text-tertiary)',
  bg: 'var(--color-surface-sunken)',
  defaultHideDot: true,
};

const CLASSIFICATION: ChipStyle = {
  fg: 'var(--color-text-secondary)',
  bg: 'var(--color-surface-sunken)',
  defaultHideDot: true,
};

export const CHIP_VARIANTS: Record<ChipVariant, ChipStyle> = {
  approved: {
    fg: 'var(--color-approve-600)',
    bg: 'var(--color-approve-soft)',
    defaultHideDot: false,
  },
  rejected: {
    fg: 'var(--color-reject-600)',
    bg: 'var(--color-reject-soft)',
    defaultHideDot: false,
  },
  'info-requested': {
    fg: 'var(--color-info-600)',
    bg: 'var(--color-info-soft)',
    defaultHideDot: false,
  },

  new: { fg: 'var(--color-approve-600)', bg: 'var(--color-approve-soft)', defaultHideDot: false },
  modified: {
    fg: 'var(--color-modified-500)',
    bg: 'var(--color-warn-soft)',
    defaultHideDot: false,
  },
  stale: { fg: 'var(--color-stale-500)', bg: 'var(--color-stale-soft)', defaultHideDot: false },
  'never-reviewed': STATE,

  'contract-change': {
    fg: 'var(--color-state-contract)',
    bg: 'var(--color-state-contract-soft)',
    defaultHideDot: false,
  },
  'indirect-impact': {
    fg: 'var(--color-state-indirect)',
    bg: 'var(--color-state-indirect-soft)',
    defaultHideDot: false,
  },
  cosmetic: STATE,

  'route-handler': CLASSIFICATION,
  service: CLASSIFICATION,
  client: CLASSIFICATION,
  repository: CLASSIFICATION,
  helper: CLASSIFICATION,
  middleware: CLASSIFICATION,
  component: CLASSIFICATION,
  page: CLASSIFICATION,
  hook: CLASSIFICATION,
  config: CLASSIFICATION,
  script: CLASSIFICATION,
  seed: CLASSIFICATION,
  fixture: CLASSIFICATION,
  test: CLASSIFICATION,
  'type-only': CLASSIFICATION,
  unclassified: STATE,
};
