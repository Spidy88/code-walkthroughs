import type { ParseOutput } from '@cw/adapters';
import type { Confidence } from '@cw/shared';
import type {
  AnalysisLlmCallback,
  ArchitecturalHints,
  ClassificationResult,
  Stage2Response,
} from '../types.ts';

type ContentSource = {
  getContent(filePath: string): string | undefined;
};

export async function classifyFilesStage2(input: {
  readonly parsedFiles: readonly ParseOutput[];
  readonly stage1: readonly ClassificationResult[];
  readonly hints: ArchitecturalHints | null;
  readonly llm: AnalysisLlmCallback['classifyStage2'] | undefined;
  readonly contentSource: ContentSource;
  readonly signal?: AbortSignal;
}): Promise<readonly ClassificationResult[]> {
  const { parsedFiles, stage1, hints, llm, contentSource, signal } = input;

  if (!llm) return stage1;

  const results: ClassificationResult[] = [];
  const fileByPath = new Map(parsedFiles.map((f) => [f.file.path, f]));
  const fileClassifications = new Map<string, ClassificationResult>();
  for (const s of stage1) {
    if (s.nodeIdentity.startsWith('file:')) {
      fileClassifications.set(s.filePath, s);
    }
  }

  for (const stage1Result of stage1) {
    if (signal?.aborted) {
      signal.throwIfAborted();
    }

    const isFile = stage1Result.nodeIdentity.startsWith('file:');
    if (!isFile) {
      const updated = fileClassifications.get(stage1Result.filePath);
      if (updated && updated.source === 'stage2') {
        results.push({
          ...stage1Result,
          classification: updated.classification,
          confidence: updated.confidence,
          source: 'stage2',
          contributingSignals: updated.contributingSignals,
          conflicting: updated.conflicting,
          justification: updated.justification,
        });
        continue;
      }
      results.push(stage1Result);
      continue;
    }

    if (stage1Result.confidence === 'high') {
      results.push(stage1Result);
      continue;
    }

    const parsed = fileByPath.get(stage1Result.filePath);
    const content = contentSource.getContent(stage1Result.filePath);
    if (!parsed || !content) {
      results.push(stage1Result);
      continue;
    }

    const response = await llm({
      file: parsed.file,
      content,
      stage1: { classification: stage1Result.classification, confidence: stage1Result.confidence },
      hints,
    });

    if (!response) {
      results.push(stage1Result);
      continue;
    }

    const reconciled = reconcile(stage1Result, response);
    results.push(reconciled);
    fileClassifications.set(stage1Result.filePath, reconciled);
  }

  return results;
}

function reconcile(stage1: ClassificationResult, stage2: Stage2Response): ClassificationResult {
  const agree = stage1.classification === stage2.classification;
  const confidence: Confidence = agree
    ? bumpConfidence(stage1.confidence, stage2.confidence)
    : 'low';

  return {
    ...stage1,
    classification: agree ? stage1.classification : stage2.classification,
    confidence,
    source: 'stage2',
    conflicting: !agree,
    justification: stage2.justification,
  };
}

function bumpConfidence(a: Confidence, b: Confidence): Confidence {
  const order: Confidence[] = ['none', 'low', 'medium', 'high'];
  const aIdx = order.indexOf(a);
  const bIdx = order.indexOf(b);
  return order[Math.max(aIdx, bIdx)] ?? 'low';
}
