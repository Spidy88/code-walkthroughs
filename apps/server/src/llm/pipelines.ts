import type {
  AnalysisLlmCallback,
  ArchitecturalHints,
  ArchitecturalPassInput,
  BranchResolution,
  BranchResolutionInput,
  PathCategorizationInput,
  PathCategorizationResponse,
  PrepSuggestionInput,
  PrepSuggestionResponse,
  Stage2Input,
  Stage2Response,
} from '@cw/analyzer';
import { classificationSchema, confidenceSchema } from '@cw/shared';
import { z } from 'zod';
import type { LlmClient, LlmResult } from './client.ts';
import { llmModels } from './models.ts';

const architecturalSchema = z.object({
  layoutConvention: z.enum(['layered', 'feature-based', 'ddd', 'ad-hoc', 'unknown']),
  likelyFrameworks: z.array(z.string()),
  notes: z.string(),
});

const stage2Schema = z.object({
  classification: classificationSchema,
  confidence: confidenceSchema,
  justification: z.string(),
});

const branchResolutionSchema = z.object({
  chosen: z.string(),
  confidence: confidenceSchema,
  justification: z.string(),
});

const prepSuggestionSchema = z.object({
  suggestion: z.unknown(),
  alternatives: z.array(z.unknown()),
});

const pathCategorizationSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string().min(1).max(80),
      order: z.number().int(),
    }),
  ),
  assignments: z.array(
    z.object({
      pathId: z.string().min(1),
      category: z.string().min(1).max(80),
    }),
  ),
});

export function createAnalyzerCallbacks(client: LlmClient): AnalysisLlmCallback {
  return {
    architecturalPass: async (input) => callArchitectural(client, input),
    classifyStage2: async (input) => callStage2(client, input),
    resolveBranch: async (input) => callBranchResolution(client, input),
    generatePrepSuggestion: async (input) => callPrepSuggestion(client, input),
    categorizePaths: async (input) => callPathCategorization(client, input),
  };
}

async function callArchitectural(
  client: LlmClient,
  input: ArchitecturalPassInput,
): Promise<ArchitecturalHints | null> {
  const result = await client.call({
    pipeline: 'architecturalPass',
    promptName: 'architectural-pass',
    promptVersion: '1',
    model: llmModels.architecturalPass,
    systemPrompt:
      'You infer high-level layout conventions and likely frameworks from a project listing. ' +
      'Respond with JSON { layoutConvention, likelyFrameworks, notes }.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          project: input.project,
          paths: input.paths,
          rootPackageJson: input.rootPackageJson,
        }),
      },
    ],
    input,
    responseSchema: architecturalSchema,
  });
  return unwrap(result);
}

async function callStage2(client: LlmClient, input: Stage2Input): Promise<Stage2Response | null> {
  const result = await client.call({
    pipeline: 'classifyStage2',
    promptName: 'classify-stage2',
    promptVersion: '1',
    model: llmModels.classifyStage2,
    systemPrompt:
      'You refine classifications from Stage 1. Respond with JSON { classification, confidence, justification }.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          file: input.file,
          stage1: input.stage1,
          hints: input.hints,
          content: truncate(input.content, 8000),
        }),
      },
    ],
    input: {
      path: input.file.path,
      contentHash: input.file.contentHash,
      stage1: input.stage1,
      hintsDigest: input.hints?.layoutConvention ?? null,
    },
    responseSchema: stage2Schema,
  });
  return unwrap(result);
}

async function callBranchResolution(
  client: LlmClient,
  input: BranchResolutionInput,
): Promise<BranchResolution | null> {
  const result = await client.call({
    pipeline: 'pathInference',
    promptName: 'branch-resolution',
    promptVersion: '1',
    model: llmModels.pathInference,
    systemPrompt:
      'You resolve ambiguous call targets. Respond with JSON { chosen, confidence, justification }.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          caller: input.callerIdentity,
          candidates: input.candidates,
          content: truncate(input.fileContent, 6000),
        }),
      },
    ],
    input: {
      caller: input.callerIdentity,
      candidates: input.candidates,
    },
    responseSchema: branchResolutionSchema,
  });
  return unwrap(result);
}

async function callPrepSuggestion(
  client: LlmClient,
  input: PrepSuggestionInput,
): Promise<PrepSuggestionResponse | null> {
  const result = await client.call({
    pipeline: 'prepSuggestion',
    promptName: 'prep-suggestion',
    promptVersion: '1',
    model: llmModels.prepSuggestion,
    systemPrompt:
      'You propose high-confidence suggestions for prep questions. Respond with JSON { suggestion, alternatives }.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          question: input.question,
          relevantContent: truncate(input.relevantContent, 6000),
        }),
      },
    ],
    input: { question: input.question },
    responseSchema: prepSuggestionSchema,
  });
  const unwrapped = unwrap(result);
  if (!unwrapped) return null;
  return unwrapped as PrepSuggestionResponse;
}

async function callPathCategorization(
  client: LlmClient,
  input: PathCategorizationInput,
): Promise<PathCategorizationResponse | null> {
  const result = await client.call({
    pipeline: 'pathCategorization',
    promptName: 'path-categorization',
    promptVersion: '1',
    model: llmModels.pathCategorization,
    systemPrompt:
      'You group execution paths into reviewer-meaningful feature categories — think "authentication", "order lifecycle", "billing", not "GET routes" or "database queries". ' +
      'Pick 3-7 categories total. Order them so the most reviewer-critical (auth, billing) come first. ' +
      'Every pathId must be assigned to exactly one named category. ' +
      'Respond with JSON { categories: [{ name, order }], assignments: [{ pathId, category }] }.',
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          project: input.project.name,
          paths: input.paths,
        }),
      },
    ],
    input: {
      paths: input.paths.map((p) => ({
        pathId: p.pathId,
        entryName: p.entryName,
        entryFilePath: p.entryFilePath,
        nodeNames: p.nodeNames,
      })),
    },
    responseSchema: pathCategorizationSchema,
  });
  return unwrap(result);
}

function unwrap<T>(result: LlmResult<T>): T | null {
  if (result.kind === 'ok') return result.value;
  if (result.kind === 'disabled' && result.cacheHit) return result.value;
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated ${text.length - max} chars]`;
}
