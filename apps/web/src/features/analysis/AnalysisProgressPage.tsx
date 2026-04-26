import type { AnalysisProgress, AnalysisStage } from '@cw/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import {
  DraftingLabel,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';

const POLL_INTERVAL_MS = 250;

export function AnalysisProgressPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const triggeredRef = useRef(false);

  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });

  const progress = useQuery({
    queryKey: ['analysis', 'getStatus'],
    queryFn: () => trpcClient.analysis.getStatus.query(),
    enabled: status.data?.active != null,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return POLL_INTERVAL_MS;
      // Poll while idle (auto-trigger may not have fired yet), collecting,
      // analyzing, or persisting. Stop only on terminal states.
      const terminal =
        data.stage === 'completed' || data.stage === 'failed' || data.stage === 'cancelled';
      return terminal ? false : POLL_INTERVAL_MS;
    },
  });

  const run = useMutation({
    mutationFn: () => trpcClient.analysis.run.mutate({}),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analysis', 'getStatus'] });
    },
  });

  const cancel = useMutation({
    mutationFn: () => trpcClient.analysis.cancel.mutate(),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analysis', 'getStatus'] });
    },
  });

  // Auto-trigger analysis once when arriving at this page with an active
  // codebase that hasn't been analyzed yet. Guard with a ref so we don't
  // re-fire on every render.
  useEffect(() => {
    if (!triggeredRef.current && status.data?.active != null && progress.data?.stage === 'idle') {
      triggeredRef.current = true;
      run.mutate();
    }
  }, [status.data, progress.data, run]);

  if (status.isLoading) {
    return <CenteredMessage label="Loading…" />;
  }

  if (status.error) {
    return <CenteredMessage label="Failed to reach server" tone="error" />;
  }

  if (!status.data?.active) {
    return (
      <main className="dot-grid min-h-screen p-8">
        <div className="mx-auto max-w-[1024px] space-y-6">
          <TitleBlock
            drawingLabel="DRAWING · CODEBASE"
            title="No active codebase"
            tagline="Open one from the picker to start an analysis."
            cells={[{ label: 'STATE', value: 'inactive' }]}
          />
          <Link
            to="/"
            className="inline-block border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
          >
            ← BACK TO PICKER
          </Link>
        </div>
      </main>
    );
  }

  const data = progress.data ?? null;
  const active = status.data.active;

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-6">
        <TitleBlock
          drawingLabel="DRAWING · ANALYSIS"
          title="Analyzing codebase"
          tagline={active.absolutePath}
          cells={[
            { label: 'DEV', value: 'local' },
            { label: 'REV', value: 'chunk-3' },
            { label: 'SHEET', value: 'progress' },
          ]}
        />
        <ActiveCodebaseSection active={active} llmEnabled={status.data.llmEnabled} />
        <ProgressSection
          progress={data}
          isRunning={run.isPending}
          onCancel={() => cancel.mutate()}
          onRetry={() => {
            triggeredRef.current = true;
            run.mutate();
          }}
          isCancelling={cancel.isPending}
          runError={run.error}
        />
        {data?.stage === 'completed' && data.summary && (
          <CompletedSection
            summary={data.summary}
            onContinue={() =>
              navigate({
                to: '/project/$projectId',
                params: { projectId: status.data?.active?.hash ?? '' },
              })
            }
          />
        )}
      </div>
    </main>
  );
}

function ActiveCodebaseSection(props: {
  active: { absolutePath: string };
  llmEnabled: boolean;
}) {
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § A · ACTIVE CODEBASE
      </DraftingLabel>
      <Panel>
        <PanelBody>
          <dl
            className="grid grid-cols-[160px_1fr] gap-y-2 text-sm"
            data-testid="codebase-overview-active"
          >
            <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
              PATH
            </dt>
            <dd className="font-mono text-text-primary break-all">{props.active.absolutePath}</dd>
            <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
              LLM ENABLED
            </dt>
            <dd className="text-text-primary">{props.llmEnabled ? 'yes' : 'no'}</dd>
          </dl>
        </PanelBody>
      </Panel>
    </section>
  );
}

function ProgressSection(props: {
  progress: AnalysisProgress | null;
  isRunning: boolean;
  onCancel: () => void;
  onRetry: () => void;
  isCancelling: boolean;
  runError: unknown;
}) {
  const stage = props.progress?.stage ?? 'idle';
  // The Node event loop is blocked during ts-morph parsing, so polled
  // progress updates queue behind the run mutation and don't arrive until
  // analysis finishes. Until that's fixed (worker thread or yield points
  // in the analyzer), the most honest in-flight signal we have is the
  // pending state of the run mutation itself.
  const polledInflight = stage === 'collecting' || stage === 'analyzing' || stage === 'persisting';
  const inflight = props.isRunning || polledInflight;
  const displayStage: AnalysisStage = polledInflight
    ? stage
    : props.isRunning
      ? 'analyzing'
      : stage;

  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § B · ANALYSIS PROGRESS
      </DraftingLabel>
      <Panel ticks={inflight}>
        <PanelHeader tone="sunken">
          <DraftingLabel size="sm">FIG. B · PIPELINE</DraftingLabel>
          <div className="flex-1" />
          <DraftingLabel size="xs" tone={inflight ? 'primary' : 'tertiary'}>
            {STAGE_LABEL[displayStage]}
          </DraftingLabel>
        </PanelHeader>
        <PanelBody>
          <ol className="space-y-1.5" data-testid="analysis-progress-stages">
            {STAGES.map((entry) => (
              <StageRow
                key={entry.stage}
                label={entry.label}
                state={describeStageState(displayStage, entry.stage)}
                detail={entry.stage === 'analyzing' ? (props.progress?.fileCount ?? null) : null}
              />
            ))}
          </ol>
          {props.isRunning && !polledInflight && (
            <p className="mt-3 text-xs text-text-tertiary">
              Analysis is running. Stage transitions will appear once the analyzer yields to the
              event loop.
            </p>
          )}
          {props.progress?.error && (
            <div
              className="mt-4 border border-error bg-reject-soft px-3 py-2 text-sm text-error"
              data-testid="analysis-progress-error"
            >
              {props.progress.error}
            </div>
          )}
          {props.runError !== null && props.runError !== undefined && stage === 'idle' && (
            <div className="mt-4 text-sm text-error">
              {String((props.runError as Error).message ?? props.runError)}
            </div>
          )}
        </PanelBody>
        <div className="flex items-center gap-2 border-t border-border bg-surface-sunken px-3.5 py-2">
          {inflight ? (
            <button
              type="button"
              onClick={props.onCancel}
              disabled={props.isCancelling}
              className="border border-error bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-error hover:bg-reject-soft disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="analysis-progress-cancel"
            >
              {props.isCancelling ? 'CANCELLING…' : 'CANCEL'}
            </button>
          ) : stage === 'cancelled' || stage === 'failed' ? (
            <button
              type="button"
              onClick={props.onRetry}
              className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-hover"
              data-testid="analysis-progress-retry"
            >
              RE-RUN
            </button>
          ) : null}
          <div className="flex-1" />
          <Link
            to="/"
            className="font-mono text-xs uppercase tracking-widest text-text-tertiary hover:text-primary"
          >
            ← BACK TO PICKER
          </Link>
        </div>
      </Panel>
    </section>
  );
}

const STAGES: ReadonlyArray<{ readonly stage: AnalysisStage; readonly label: string }> = [
  { stage: 'collecting', label: 'Collect tracked files' },
  { stage: 'analyzing', label: 'Parse · classify · trace paths' },
  { stage: 'persisting', label: 'Persist analysis to cache' },
  { stage: 'completed', label: 'Done' },
];

const STAGE_LABEL: Record<AnalysisStage, string> = {
  idle: 'IDLE',
  collecting: 'COLLECTING',
  analyzing: 'ANALYZING',
  persisting: 'PERSISTING',
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

const STAGE_ORDER: Record<AnalysisStage, number> = {
  idle: 0,
  collecting: 1,
  analyzing: 2,
  persisting: 3,
  completed: 4,
  failed: 4,
  cancelled: 4,
};

type StageState = 'pending' | 'active' | 'done' | 'errored';

function describeStageState(current: AnalysisStage, target: AnalysisStage): StageState {
  if (current === 'failed' && STAGE_ORDER[target] === STAGE_ORDER[current]) return 'errored';
  if (STAGE_ORDER[current] > STAGE_ORDER[target]) return 'done';
  if (STAGE_ORDER[current] === STAGE_ORDER[target])
    return current === 'completed' ? 'done' : 'active';
  return 'pending';
}

function StageRow(props: { label: string; state: StageState; detail: number | null }) {
  return (
    <li className="flex items-center gap-2.5 font-mono text-xs">
      <StageIndicator state={props.state} />
      <span
        className={
          props.state === 'pending'
            ? 'text-text-tertiary'
            : props.state === 'errored'
              ? 'text-error'
              : 'text-text-primary'
        }
      >
        {props.label}
      </span>
      {props.detail != null && <span className="text-text-tertiary">— {props.detail} files</span>}
    </li>
  );
}

function StageIndicator(props: { state: StageState }) {
  const map = {
    pending: 'border-border-strong bg-surface',
    active: 'border-primary bg-primary',
    done: 'border-approve-600 bg-approve-600',
    errored: 'border-reject-600 bg-reject-soft',
  } as const;
  return (
    <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 border ${map[props.state]}`} />
  );
}

function CompletedSection(props: {
  summary: NonNullable<AnalysisProgress['summary']>;
  onContinue: () => void;
}) {
  const rows: Array<[string, string]> = [
    ['Files', props.summary.fileCount.toString()],
    ['Classifications', props.summary.classificationCount.toString()],
    ['Entry points', props.summary.entryPointCount.toString()],
    ['Paths', props.summary.pathCount.toString()],
    ['Prep questions', props.summary.prepQuestionCount.toString()],
    ['Duration', `${props.summary.durationMs} ms`],
    ['LLM enabled', props.summary.llmEnabled ? 'yes' : 'no'],
  ];
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § C · ANALYSIS COMPLETE
      </DraftingLabel>
      <Panel ticks>
        <PanelHeader tone="sunken">
          <DraftingLabel size="sm" tone="primary">
            FIG. C · SUMMARY
          </DraftingLabel>
        </PanelHeader>
        <PanelBody>
          <dl
            className="grid grid-cols-[200px_1fr] gap-y-1.5 text-sm"
            data-testid="analysis-progress-summary"
          >
            {rows.map(([label, value]) => (
              <RowEntry key={label} label={label} value={value} />
            ))}
          </dl>
        </PanelBody>
        <div className="flex items-center gap-2 border-t border-border bg-surface-sunken px-3.5 py-2">
          <button
            type="button"
            onClick={props.onContinue}
            className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-hover"
            data-testid="analysis-progress-continue"
          >
            CONTINUE ↗
          </button>
        </div>
      </Panel>
    </section>
  );
}

function RowEntry(props: { label: string; value: string }) {
  return (
    <>
      <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
        {props.label}
      </dt>
      <dd className="text-text-primary">{props.value}</dd>
    </>
  );
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
