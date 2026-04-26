import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Chip,
  DraftingLabel,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';

type PrepKind = 'classification' | 'path_branch' | 'entry_point' | 'intent' | 'rename';

type PrepClassificationContext = {
  readonly kind: 'classification';
  readonly filePath: string;
  readonly nodeIdentity: string;
  readonly stage1Candidate: string | null;
  readonly stage2Candidate: string | null;
};
type PrepPathBranchContext = {
  readonly kind: 'path_branch';
  readonly pathId: string;
  readonly callerIdentity: string;
  readonly candidates: readonly string[];
};
type PrepEntryPointContext = {
  readonly kind: 'entry_point';
  readonly projectId: string;
  readonly detectedCount: number;
};
type PrepIntentContext = { readonly kind: 'intent'; readonly nodeIdentity: string };
type PrepRenameContext = {
  readonly kind: 'rename';
  readonly oldIdentity: string;
  readonly newIdentity: string;
  readonly similarity: number;
};
type PrepContext =
  | PrepClassificationContext
  | PrepPathBranchContext
  | PrepEntryPointContext
  | PrepIntentContext
  | PrepRenameContext;

type PrepAnswer =
  | { readonly kind: 'classification'; readonly classification: string }
  | { readonly kind: 'path_branch'; readonly chosenIdentity: string }
  | { readonly kind: 'entry_point'; readonly entryPointId: string }
  | { readonly kind: 'intent'; readonly text: string }
  | { readonly kind: 'rename'; readonly decision: 'carry_forward' | 'treat_as_new' };

type PrepQuestion = {
  readonly key: string;
  readonly kind: PrepKind;
  readonly context: PrepContext;
  readonly suggestion: { readonly value: string; readonly label: string } | null;
  readonly alternatives: ReadonlyArray<{ readonly value: string; readonly label: string }>;
  readonly createdAt: string;
  readonly answer: PrepAnswer | null;
  readonly answeredAt: string | null;
};

const CLASSIFICATION_OPTIONS = [
  'route_handler',
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
  'type_only',
  'unclassified',
] as const;

export function PrepQueuePage() {
  const [includeAnswered, setIncludeAnswered] = useState(false);
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });

  const questionsQuery = useQuery({
    queryKey: ['prep', 'listQuestions', includeAnswered],
    queryFn: () => trpcClient.prep.listQuestions.query({ includeAnswered }),
    enabled: status.data?.active != null,
  });

  const answerMutation = useMutation({
    mutationFn: (input: { key: string; answer: PrepAnswer }) =>
      trpcClient.prep.answerQuestion.mutate({ key: input.key, answer: input.answer }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['prep', 'listQuestions'] }),
        // Classification answers can shift downstream walkthrough
        // chips, so clear those caches too.
        queryClient.invalidateQueries({ queryKey: ['walkthrough'] }),
      ]);
    },
  });

  if (status.isLoading) {
    return <CenteredMessage label="Loading…" />;
  }
  if (!status.data?.active) {
    return <CenteredMessage label="No active codebase — open one from the picker." tone="error" />;
  }

  const questions = (questionsQuery.data ?? []) as ReadonlyArray<PrepQuestion>;
  const projectId = status.data.active.hash;

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · PREP QUEUE"
          title="Prep questions"
          tagline="Answer the open prep questions to sharpen analysis before walking paths."
          cells={[
            { label: 'OPEN', value: String(questions.filter((q) => q.answer === null).length) },
            { label: 'TOTAL', value: String(questions.length) },
            {
              label: 'FILTER',
              value: includeAnswered ? 'all' : 'pending',
            },
          ]}
        />
        <div className="flex items-center gap-3" data-testid="prep-queue-controls">
          <Link
            to="/project/$projectId"
            params={{ projectId }}
            className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
          >
            ← OVERVIEW
          </Link>
          <label className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-text-secondary">
            <input
              type="checkbox"
              checked={includeAnswered}
              onChange={(e) => setIncludeAnswered(e.target.checked)}
              className="accent-primary"
              data-testid="prep-queue-include-answered"
            />
            Show answered
          </label>
        </div>
        {questionsQuery.isLoading ? (
          <CenteredMessage label="Loading questions…" />
        ) : questionsQuery.error ? (
          <CenteredMessage label="Failed to load prep questions" tone="error" />
        ) : questions.length === 0 ? (
          <Panel>
            <PanelBody>
              <p className="text-sm text-text-tertiary" data-testid="prep-queue-empty">
                {includeAnswered
                  ? 'No prep questions for this codebase.'
                  : 'No open prep questions — every question has been answered.'}
              </p>
            </PanelBody>
          </Panel>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="prep-queue-list">
            {questions.map((q) => (
              <li key={q.key}>
                <PrepQuestionPanel
                  question={q}
                  isPending={answerMutation.isPending}
                  error={answerMutation.error}
                  onAnswer={(answer) => answerMutation.mutate({ key: q.key, answer })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function PrepQuestionPanel(props: {
  question: PrepQuestion;
  isPending: boolean;
  error: unknown;
  onAnswer: (answer: PrepAnswer) => void;
}) {
  const { question } = props;
  const summary = describeContext(question.context);

  return (
    <Panel>
      <PanelHeader tone="sunken">
        <DraftingLabel size="sm">
          FIG. Q · {question.kind.toUpperCase().replace('_', ' ')}
        </DraftingLabel>
        <span
          className="font-mono text-xs text-text-secondary truncate"
          data-testid="prep-question-target"
        >
          {summary.target}
        </span>
        <div className="flex-1" />
        {question.answer ? (
          <Chip variant="approved">ANSWERED</Chip>
        ) : (
          <DraftingLabel size="xs">PENDING</DraftingLabel>
        )}
      </PanelHeader>
      <PanelBody>
        <p className="text-sm text-text-primary">{summary.prompt}</p>
        {summary.detail && (
          <p className="mt-1 font-mono text-xs text-text-tertiary">{summary.detail}</p>
        )}
        {props.error !== null && props.error !== undefined && (
          <div className="mt-2 text-sm text-error" data-testid="prep-question-error">
            {String((props.error as Error).message ?? props.error)}
          </div>
        )}
      </PanelBody>
      <div
        className="border-t border-border bg-surface-sunken px-3.5 py-2"
        data-testid={`prep-question-actions-${question.key}`}
      >
        {question.kind === 'classification' && (
          <ClassificationAnswerComposer
            current={
              question.answer?.kind === 'classification' ? question.answer.classification : null
            }
            isPending={props.isPending}
            onAnswer={(classification) =>
              props.onAnswer({ kind: 'classification', classification })
            }
          />
        )}
        {question.kind !== 'classification' && (
          <p
            className="font-mono text-xs text-text-tertiary"
            data-testid="prep-question-not-yet-supported"
          >
            UI for this prep kind lands in chunk 9B.
          </p>
        )}
      </div>
    </Panel>
  );
}

function ClassificationAnswerComposer(props: {
  current: string | null;
  isPending: boolean;
  onAnswer: (classification: string) => void;
}) {
  const [selected, setSelected] = useState<string>(props.current ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <DraftingLabel size="xs">SET CLASSIFICATION</DraftingLabel>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={props.isPending}
        className="border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-primary"
        data-testid="prep-question-classification-select"
      >
        <option value="">— pick a classification —</option>
        {CLASSIFICATION_OPTIONS.map((c) => (
          <option key={c} value={c}>
            {c.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
      <div className="flex-1" />
      <button
        type="button"
        onClick={() => {
          if (!selected) return;
          props.onAnswer(selected);
        }}
        disabled={props.isPending || !selected}
        className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
        data-testid="prep-question-answer-submit"
      >
        Apply
      </button>
    </div>
  );
}

function describeContext(ctx: PrepContext): {
  target: string;
  prompt: string;
  detail: string | null;
} {
  switch (ctx.kind) {
    case 'classification': {
      const stage1 = ctx.stage1Candidate ?? '—';
      const stage2 = ctx.stage2Candidate ?? '—';
      return {
        target: ctx.filePath,
        prompt: `What's the right classification for ${ctx.filePath}? Stage 1 wasn't sure, and stage 2 ran without an LLM.`,
        detail: `stage1: ${stage1}  ·  stage2: ${stage2}`,
      };
    }
    case 'path_branch':
      return {
        target: ctx.callerIdentity,
        prompt: 'Which downstream call should this path follow?',
        detail: `${ctx.candidates.length} candidate(s)`,
      };
    case 'entry_point':
      return {
        target: ctx.projectId,
        prompt: 'Confirm the project entry point.',
        detail: `${ctx.detectedCount} candidate(s) detected`,
      };
    case 'intent':
      return {
        target: ctx.nodeIdentity,
        prompt: 'What is this function for?',
        detail: null,
      };
    case 'rename':
      return {
        target: `${ctx.oldIdentity} → ${ctx.newIdentity}`,
        prompt: 'Treat this as a rename, or as a new function?',
        detail: `similarity ${(ctx.similarity * 100).toFixed(0)}%`,
      };
  }
}

function CenteredMessage(props: { label: string; tone?: 'tertiary' | 'error' }) {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-8">
      <div className={props.tone === 'error' ? 'text-error' : 'text-text-tertiary'}>
        {props.label}
      </div>
    </main>
  );
}
