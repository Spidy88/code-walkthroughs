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
  /**
   * Pending path_branch questions for a given path. Used by the
   * walkthrough page to inject the branch composer inline above the
   * canvas when the focused node is a caller with a question.
   */
  listForPath(input: { pathId: string }): Promise<PrepQuestionWithAnswer[]>;
  get(key: string): Promise<PrepQuestionWithAnswer | null>;
  answer(input: { key: string; answer: PrepAnswerPayload; now: Date }): Promise<{
    answered: boolean;
    appliedClassification: Classification | null;
    /**
     * True when the answer can only be honoured by re-running
     * analysis (e.g., path_branch — the path_nodes table needs to
     * be re-materialised with the chosen branch). The client kicks
     * that off immediately after the answer returns.
     */
    requiresReanalysis: boolean;
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

    async listForPath({ pathId }) {
      const [questions, answers] = await Promise.all([
        cache.select().from(prepQuestions),
        state.select().from(prepAnswers),
      ]);
      const answerByKey = new Map(answers.map((a) => [a.questionKey, a]));
      return questions
        .filter((q) => {
          if (q.kind !== 'path_branch') return false;
          const ctx = q.context as { readonly pathId?: string };
          return ctx.pathId === pathId;
        })
        .map((q) => rowToQuestion(q, answerByKey.get(q.key) ?? null))
        .filter((q) => q.answer === null);
    },

    async get(key) {
      const [q] = await cache.select().from(prepQuestions).where(eq(prepQuestions.key, key));
      if (!q) return null;
      const [a] = await state.select().from(prepAnswers).where(eq(prepAnswers.questionKey, key));
      return rowToQuestion(q, a ?? null);
    },

    async answer({ key, answer, now }) {
      const [q] = await cache.select().from(prepQuestions).where(eq(prepQuestions.key, key));
      if (!q) return { answered: false, appliedClassification: null, requiresReanalysis: false };
      // Reject mismatches early so the cache doesn't drift on a
      // shape-incompatible payload (e.g., `path_branch` answer on a
      // `classification` question).
      if (answer.kind !== q.kind) {
        return { answered: false, appliedClassification: null, requiresReanalysis: false };
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

      // Feedback loop into cache.db.
      //  - classification: rewrite the cache row in place (cheap, no
      //    re-analysis needed).
      //  - path_branch: only the analyzer can re-walk the path with
      //    the chosen callee. We flag requiresReanalysis so the
      //    client kicks off analysis.run once the answer is
      //    persisted.
      let applied: Classification | null = null;
      let requiresReanalysis = false;
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
      } else if (answer.kind === 'path_branch' && q.kind === 'path_branch') {
        requiresReanalysis = true;
      }

      return { answered: true, appliedClassification: applied, requiresReanalysis };
    },
  };
}
