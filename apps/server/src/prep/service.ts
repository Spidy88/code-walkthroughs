import type { Classification, PrepQuestion, PrepQuestionKind } from '@cw/shared';
import { ulid } from '@cw/shared';
import { eq } from 'drizzle-orm';
import type { CacheDb, StateDb } from '../db/codebase.ts';
import { classifications } from '../db/schema/cache/classifications.ts';
import { prepQuestions } from '../db/schema/cache/prep-questions.ts';
import { prepAnswers } from '../db/schema/state/prep-answers.ts';

export type PrepAnswerPayload =
  | { readonly kind: 'classification'; readonly classification: Classification }
  | { readonly kind: 'path_branch'; readonly chosenIdentity: string }
  | { readonly kind: 'entry_point'; readonly entryPointId: string }
  | { readonly kind: 'intent'; readonly text: string }
  | { readonly kind: 'rename'; readonly decision: 'carry_forward' | 'treat_as_new' };

export type PrepQuestionWithAnswer = PrepQuestion & {
  readonly answer: PrepAnswerPayload | null;
  readonly answeredAt: string | null;
};

export type PrepService = {
  list(input: { includeAnswered: boolean }): Promise<PrepQuestionWithAnswer[]>;
  get(key: string): Promise<PrepQuestionWithAnswer | null>;
  answer(input: { key: string; answer: PrepAnswerPayload; now: Date }): Promise<{
    answered: boolean;
    appliedClassification: Classification | null;
  }>;
};

function rowToQuestion(
  row: typeof prepQuestions.$inferSelect,
  answer: typeof prepAnswers.$inferSelect | null,
): PrepQuestionWithAnswer {
  return {
    key: row.key,
    kind: row.kind as PrepQuestionKind,
    context: row.context as PrepQuestion['context'],
    suggestion: (row.suggestion ?? null) as PrepQuestion['suggestion'],
    alternatives: (row.alternatives ?? []) as PrepQuestion['alternatives'],
    createdAt: row.createdAt,
    answer: answer ? (answer.answer as PrepAnswerPayload) : null,
    answeredAt: answer?.answeredAt ?? null,
  };
}

export function createPrepService(input: {
  readonly cache: CacheDb;
  readonly state: StateDb;
}): PrepService {
  const { cache, state } = input;

  return {
    async list({ includeAnswered }) {
      const [questions, answers] = await Promise.all([
        cache.select().from(prepQuestions),
        state.select().from(prepAnswers),
      ]);
      const answerByKey = new Map(answers.map((a) => [a.questionKey, a]));
      const merged = questions.map((q) => rowToQuestion(q, answerByKey.get(q.key) ?? null));
      // Pending first, then answered (if requested), each ordered by
      // createdAt — gives the reviewer a stable, queue-like surface.
      merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      if (!includeAnswered) {
        return merged.filter((q) => q.answer === null);
      }
      return merged;
    },

    async get(key) {
      const [q] = await cache.select().from(prepQuestions).where(eq(prepQuestions.key, key));
      if (!q) return null;
      const [a] = await state.select().from(prepAnswers).where(eq(prepAnswers.questionKey, key));
      return rowToQuestion(q, a ?? null);
    },

    async answer({ key, answer, now }) {
      const [q] = await cache.select().from(prepQuestions).where(eq(prepQuestions.key, key));
      if (!q) return { answered: false, appliedClassification: null };
      // Reject mismatches early so the cache doesn't drift on a
      // shape-incompatible payload (e.g., `path_branch` answer on a
      // `classification` question).
      if (answer.kind !== q.kind) {
        return { answered: false, appliedClassification: null };
      }

      const ts = now.toISOString();
      const [existing] = await state
        .select()
        .from(prepAnswers)
        .where(eq(prepAnswers.questionKey, key));

      if (existing) {
        await state
          .update(prepAnswers)
          .set({ answer: answer as unknown, answeredAt: ts, questionKind: answer.kind })
          .where(eq(prepAnswers.id, existing.id));
      } else {
        await state.insert(prepAnswers).values({
          id: ulid(),
          questionKey: key,
          questionKind: answer.kind,
          answer: answer as unknown,
          answeredAt: ts,
        });
      }

      // Feedback loop into cache.db. Today only the classification
      // path is wired; other kinds park their answer for chunk 9B's
      // path-rematerialization etc.
      let applied: Classification | null = null;
      if (answer.kind === 'classification' && q.kind === 'classification') {
        const ctx = q.context as { readonly nodeIdentity: string };
        await cache
          .update(classifications)
          .set({
            classification: answer.classification,
            confidence: 'high',
            source: 'prep',
            justification: 'reviewer-supplied via prep queue',
            conflicting: 'false',
            updatedAt: ts,
          })
          .where(eq(classifications.nodeIdentity, ctx.nodeIdentity));
        applied = answer.classification;
      }

      return { answered: true, appliedClassification: applied };
    },
  };
}
