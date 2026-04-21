import type { ClassifierSignal, ParseOutput, SignalMatchResult } from '@cw/adapters';
import type { Classification, Confidence } from '@cw/shared';
import type { ClassificationResult } from '../types.ts';

type WeightedMatch = {
  readonly signal: ClassifierSignal;
  readonly result: SignalMatchResult;
};

export function classifyFilesStage1(input: {
  readonly project: import('@cw/shared').ProjectMeta;
  readonly parsedFiles: readonly ParseOutput[];
  readonly signals: readonly ClassifierSignal[];
}): readonly ClassificationResult[] {
  const { project, parsedFiles, signals } = input;
  const results: ClassificationResult[] = [];

  for (const parsed of parsedFiles) {
    const relativePath = parsed.file.path;
    const matches: WeightedMatch[] = [];

    for (const signal of signals) {
      const match = signal.match({ project, parsed, relativePath });
      if (match) matches.push({ signal, result: match });
    }

    const fileResult = aggregate(matches);

    results.push({
      nodeIdentity: `file:${parsed.file.path}`,
      filePath: parsed.file.path,
      classification: fileResult.classification,
      confidence: fileResult.confidence,
      source: 'stage1',
      contributingSignals: fileResult.contributingSignals,
      conflicting: fileResult.conflicting,
      justification: null,
      contentHash: parsed.file.contentHash,
    });

    for (const node of parsed.nodes) {
      results.push({
        nodeIdentity: node.identity,
        filePath: parsed.file.path,
        classification: fileResult.classification,
        confidence: fileResult.confidence,
        source: 'stage1',
        contributingSignals: fileResult.contributingSignals,
        conflicting: fileResult.conflicting,
        justification: null,
        contentHash: node.contentHash,
      });
    }
  }

  return results;
}

function aggregate(matches: readonly WeightedMatch[]): {
  classification: Classification;
  confidence: Confidence;
  contributingSignals: readonly string[];
  conflicting: boolean;
} {
  if (matches.length === 0) {
    return {
      classification: 'unclassified',
      confidence: 'none',
      contributingSignals: [],
      conflicting: false,
    };
  }

  const byClassification = new Map<Classification, WeightedMatch[]>();
  for (const m of matches) {
    const list = byClassification.get(m.result.classification) ?? [];
    list.push(m);
    byClassification.set(m.result.classification, list);
  }

  const ranked = [...byClassification.entries()]
    .map(([classification, group]) => ({
      classification,
      score: scoreGroup(group),
      signals: group.map((g) => g.signal.name),
    }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top) {
    return {
      classification: 'unclassified',
      confidence: 'none',
      contributingSignals: [],
      conflicting: false,
    };
  }
  const conflicting = ranked.length > 1 && (ranked[1]?.score ?? 0) >= top.score * 0.8;

  const confidence: Confidence = conflicting
    ? 'low'
    : top.score >= 3
      ? 'high'
      : top.score >= 2
        ? 'medium'
        : 'low';

  return {
    classification: top.classification,
    confidence,
    contributingSignals: top.signals,
    conflicting,
  };
}

function scoreGroup(group: readonly WeightedMatch[]): number {
  let score = 0;
  for (const m of group) {
    if (m.signal.weight === 'high') score += 3;
    else if (m.signal.weight === 'medium') score += 2;
    else score += 1;
  }
  return score;
}
