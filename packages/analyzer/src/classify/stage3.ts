import type { PrepQuestion } from '@cw/shared';
import { hashCanonical } from '@cw/shared';
import type { ClassificationResult } from '../types.ts';

export function generateStage3PrepQuestions(input: {
  readonly classifications: readonly ClassificationResult[];
}): readonly PrepQuestion[] {
  const { classifications } = input;
  const now = new Date().toISOString();
  const questions: PrepQuestion[] = [];

  for (const c of classifications) {
    if (!c.nodeIdentity.startsWith('file:')) continue;
    const needsPrep = c.confidence === 'low' || c.confidence === 'none' || c.conflicting;
    if (!needsPrep) continue;

    const key = hashCanonical({
      kind: 'classification',
      filePath: c.filePath,
      nodeIdentity: c.nodeIdentity,
    });

    questions.push({
      key,
      kind: 'classification',
      context: {
        kind: 'classification',
        filePath: c.filePath,
        nodeIdentity: c.nodeIdentity,
        stage1Candidate: c.source === 'stage1' ? c.classification : null,
        stage2Candidate: c.source === 'stage2' ? c.classification : null,
      },
      suggestion: null,
      alternatives: [],
      createdAt: now,
    });
  }

  return questions;
}
