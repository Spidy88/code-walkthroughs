import { describe, expect, test } from 'vitest';
import { CHIP_VARIANTS, type ChipVariant } from '../src/components/blueprint/chip/chip-variants.ts';

const ALL_VARIANTS: readonly ChipVariant[] = [
  'approved',
  'rejected',
  'info-requested',
  'new',
  'modified',
  'stale',
  'never-reviewed',
  'contract-change',
  'indirect-impact',
  'cosmetic',
  'route-handler',
  'service',
  'client',
  'repository',
  'helper',
  'middleware',
  'component',
  'page',
  'hook',
  'config',
  'script',
  'seed',
  'fixture',
  'test',
  'type-only',
  'unclassified',
];

describe('CHIP_VARIANTS', () => {
  test('contains an entry for every ChipVariant', () => {
    // Arrange — the canonical list above.
    // Act — read the keys from the variant map.
    const keys = Object.keys(CHIP_VARIANTS).sort();
    // Assert
    expect(keys).toEqual([...ALL_VARIANTS].sort());
  });

  test('every entry has fg, bg, and defaultHideDot', () => {
    for (const variant of ALL_VARIANTS) {
      const style = CHIP_VARIANTS[variant];
      expect(style.fg, `${variant} fg`).toMatch(/^var\(--color-[\w-]+\)$/);
      expect(style.bg, `${variant} bg`).toMatch(/^var\(--color-[\w-]+\)$/);
      expect(typeof style.defaultHideDot, `${variant} defaultHideDot`).toBe('boolean');
    }
  });

  test('classification variants share the same style', () => {
    const classifications: readonly ChipVariant[] = [
      'route-handler',
      'service',
      'client',
      'repository',
      'helper',
      'middleware',
      'component',
      'page',
      'hook',
      'config',
      'script',
      'seed',
      'fixture',
      'test',
      'type-only',
    ];
    const reference = CHIP_VARIANTS[classifications[0] as ChipVariant];
    for (const variant of classifications.slice(1)) {
      expect(CHIP_VARIANTS[variant]).toEqual(reference);
    }
  });

  test('state-style variants render without a dot by default', () => {
    expect(CHIP_VARIANTS['never-reviewed'].defaultHideDot).toBe(true);
    expect(CHIP_VARIANTS.cosmetic.defaultHideDot).toBe(true);
    expect(CHIP_VARIANTS.unclassified.defaultHideDot).toBe(true);
  });

  test('positive-status variants render with a dot by default', () => {
    expect(CHIP_VARIANTS.approved.defaultHideDot).toBe(false);
    expect(CHIP_VARIANTS.rejected.defaultHideDot).toBe(false);
    expect(CHIP_VARIANTS.modified.defaultHideDot).toBe(false);
    expect(CHIP_VARIANTS['contract-change'].defaultHideDot).toBe(false);
  });
});
