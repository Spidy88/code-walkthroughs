import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Chip,
  type ChipVariant,
  DraftingLabel,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';

type Delta = {
  readonly contractChanges: ReadonlyArray<{
    readonly id: string;
    readonly nodeIdentity: string;
    readonly kind: string;
    readonly note: string;
  }>;
  readonly affectedCallers: ReadonlyArray<{
    readonly contractChangeId: string;
    readonly callerIdentity: string;
    readonly callerOnChangedPath: boolean;
    readonly callerOnAnyWalkedPath: boolean;
  }>;
  readonly pathDeltas: ReadonlyArray<{
    readonly basePathId: string | null;
    readonly headPathId: string | null;
    readonly classification: string;
    readonly addedNodes: ReadonlyArray<string>;
    readonly removedNodes: ReadonlyArray<string>;
  }>;
  readonly indirectImpactPaths: ReadonlyArray<{
    readonly headPathId: string;
    readonly contractChangeIds: ReadonlyArray<string>;
  }>;
};

const SAMPLE_BASE = `// base.ts — paste two filesets to compare. The fixture below shows
// an exported helper that becomes private in head plus a new
// exported function that wasn't there before.
export function existing() { return 1; }
export function willBeUnexported() { return 2; }
function privateOne() { return 3; }
`;

const SAMPLE_HEAD = `// head.ts
export function existing() { return 1; }
function willBeUnexported() { return 2; }
function privateOne() { return 3; }
export function brandNew() { return 4; }
`;

const CLASSIFICATION_VARIANT: Record<string, ChipVariant> = {
  net_new: 'new',
  net_gone: 'rejected',
  modified_in_place: 'modified',
  restructured: 'modified',
  unchanged: 'approved',
};

const CONTRACT_KIND_LABEL: Record<string, string> = {
  export_added: 'EXPORT ADDED',
  export_removed: 'EXPORT REMOVED',
  param_added: 'PARAM ADDED',
  param_removed: 'PARAM REMOVED',
  param_type_changed: 'PARAM TYPE CHANGED',
  return_type_changed: 'RETURN CHANGED',
};

export function ComparisonPage() {
  const [baseSrc, setBaseSrc] = useState(SAMPLE_BASE);
  const [headSrc, setHeadSrc] = useState(SAMPLE_HEAD);
  const [delta, setDelta] = useState<Delta | null>(null);
  const [mode, setMode] = useState<'refs' | 'paste'>('refs');
  const [baseRef, setBaseRef] = useState('main');
  const [headRef, setHeadRef] = useState('HEAD');
  const [meta, setMeta] = useState<{
    readonly baseSha: string;
    readonly headSha: string;
    readonly baseFileCount: number;
    readonly headFileCount: number;
  } | null>(null);

  const runMutation = useMutation({
    mutationFn: (input: { base: string; head: string }) =>
      trpcClient.comparison.run.mutate({
        base: [{ filePath: 'sample.ts', content: input.base }],
        head: [{ filePath: 'sample.ts', content: input.head }],
      }),
    onSuccess: (d) => {
      setDelta(d as Delta);
      setMeta(null);
    },
  });

  const runRefsMutation = useMutation({
    mutationFn: (input: { baseRef: string; headRef: string }) =>
      trpcClient.comparison.runRefs.mutate(input),
    onSuccess: (result) => {
      setDelta(result.delta as Delta);
      setMeta({
        baseSha: result.baseSha,
        headSha: result.headSha,
        baseFileCount: result.baseFileCount,
        headFileCount: result.headFileCount,
      });
    },
  });

  const isPending = runMutation.isPending || runRefsMutation.isPending;
  const submitError = runMutation.error ?? runRefsMutation.error;

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1200px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · COMPARISON"
          title="Comparison"
          tagline="Three layers — contract changes, path deltas, indirect impact — between two refs."
          cells={[
            { label: 'CHANGES', value: delta ? String(delta.contractChanges.length) : '—' },
            { label: 'PATHS', value: delta ? String(delta.pathDeltas.length) : '—' },
            {
              label: 'INDIRECT',
              value: delta ? String(delta.indirectImpactPaths.length) : '—',
            },
          ]}
        />
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
          >
            ← PICKER
          </Link>
          {meta && (
            <span className="font-mono text-xs text-text-tertiary" data-testid="comparison-meta">
              base {meta.baseSha.slice(0, 8)} ({meta.baseFileCount} files) · head{' '}
              {meta.headSha.slice(0, 8)} ({meta.headFileCount} files)
            </span>
          )}
        </div>

        <Panel>
          <PanelHeader tone="sunken">
            <DraftingLabel size="sm">FIG. S · SETUP</DraftingLabel>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              {(['refs', 'paste'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={[
                    'border px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-widest',
                    mode === m
                      ? 'border-primary bg-primary text-text-inverse'
                      : 'border-border-strong bg-surface text-text-primary',
                  ].join(' ')}
                  data-testid={`comparison-mode-${m}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </PanelHeader>
          <PanelBody>
            {mode === 'refs' ? (
              <div className="grid grid-cols-2 gap-3" data-testid="comparison-refs-form">
                <div>
                  <DraftingLabel size="xs">BASE REF</DraftingLabel>
                  <input
                    value={baseRef}
                    onChange={(e) => setBaseRef(e.target.value)}
                    disabled={isPending}
                    placeholder="main"
                    className="mt-1 block w-full border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-primary"
                    data-testid="comparison-base-ref"
                  />
                </div>
                <div>
                  <DraftingLabel size="xs">HEAD REF</DraftingLabel>
                  <input
                    value={headRef}
                    onChange={(e) => setHeadRef(e.target.value)}
                    disabled={isPending}
                    placeholder="HEAD"
                    className="mt-1 block w-full border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-primary"
                    data-testid="comparison-head-ref"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <DraftingLabel size="xs">BASE SOURCE</DraftingLabel>
                  <textarea
                    rows={10}
                    value={baseSrc}
                    onChange={(e) => setBaseSrc(e.target.value)}
                    disabled={isPending}
                    className="mt-1 block w-full resize-y border border-border-strong bg-surface px-2 py-1 font-mono text-[0.6875rem] leading-[1.55] text-text-primary outline-none focus:border-primary"
                    data-testid="comparison-base-source"
                  />
                </div>
                <div>
                  <DraftingLabel size="xs">HEAD SOURCE</DraftingLabel>
                  <textarea
                    rows={10}
                    value={headSrc}
                    onChange={(e) => setHeadSrc(e.target.value)}
                    disabled={isPending}
                    className="mt-1 block w-full resize-y border border-border-strong bg-surface px-2 py-1 font-mono text-[0.6875rem] leading-[1.55] text-text-primary outline-none focus:border-primary"
                    data-testid="comparison-head-source"
                  />
                </div>
              </div>
            )}
            {submitError !== null && submitError !== undefined && (
              <div className="mt-2 text-sm text-error" data-testid="comparison-error">
                {String((submitError as Error).message ?? submitError)}
              </div>
            )}
          </PanelBody>
          <div className="flex items-center justify-end border-t border-border bg-surface-sunken px-3.5 py-2">
            <button
              type="button"
              onClick={() =>
                mode === 'refs'
                  ? runRefsMutation.mutate({ baseRef, headRef })
                  : runMutation.mutate({ base: baseSrc, head: headSrc })
              }
              disabled={isPending}
              className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
              data-testid="comparison-run"
            >
              {isPending ? 'Running…' : 'Run comparison'}
            </button>
          </div>
        </Panel>

        {delta && (
          <div className="grid gap-4 lg:grid-cols-3">
            <Panel>
              <PanelHeader tone="sunken">
                <DraftingLabel size="sm" tone="primary">
                  L1 · CONTRACT CHANGES
                </DraftingLabel>
                <div className="flex-1" />
                <DraftingLabel size="xs">{delta.contractChanges.length}</DraftingLabel>
              </PanelHeader>
              {delta.contractChanges.length === 0 ? (
                <PanelBody>
                  <p className="text-sm text-text-tertiary" data-testid="comparison-contract-empty">
                    No contract changes detected.
                  </p>
                </PanelBody>
              ) : (
                <ul className="divide-y divide-border" data-testid="comparison-contract-list">
                  {delta.contractChanges.map((c) => (
                    <li
                      key={c.id}
                      className="flex flex-col gap-0.5 px-3.5 py-2"
                      data-testid={`comparison-contract-${c.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Chip variant="contract-change">
                          {CONTRACT_KIND_LABEL[c.kind] ?? c.kind.toUpperCase()}
                        </Chip>
                        <span className="font-mono text-xs text-text-primary truncate">
                          {c.nodeIdentity.split(':').slice(1).join(':')}
                        </span>
                      </div>
                      <span className="font-mono text-[0.625rem] text-text-tertiary">{c.note}</span>
                      <CallerSummary
                        change={c}
                        affected={delta.affectedCallers.filter((a) => a.contractChangeId === c.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader tone="sunken">
                <DraftingLabel size="sm" tone="primary">
                  L2 · PATH DELTAS
                </DraftingLabel>
                <div className="flex-1" />
                <DraftingLabel size="xs">{delta.pathDeltas.length}</DraftingLabel>
              </PanelHeader>
              {delta.pathDeltas.length === 0 ? (
                <PanelBody>
                  <p className="text-sm text-text-tertiary">No paths in either ref.</p>
                </PanelBody>
              ) : (
                <ul className="divide-y divide-border" data-testid="comparison-path-list">
                  {delta.pathDeltas.map((p) => (
                    <li
                      key={`${p.basePathId ?? '?'}-${p.headPathId ?? '?'}`}
                      className="flex flex-col gap-0.5 px-3.5 py-2"
                      data-testid={`comparison-path-${p.basePathId ?? p.headPathId}`}
                    >
                      <div className="flex items-center gap-2">
                        <Chip variant={CLASSIFICATION_VARIANT[p.classification] ?? 'modified'}>
                          {p.classification.toUpperCase()}
                        </Chip>
                        <span className="font-mono text-xs text-text-tertiary truncate">
                          base {p.basePathId?.slice(0, 8) ?? '—'} ↔ head{' '}
                          {p.headPathId?.slice(0, 8) ?? '—'}
                        </span>
                      </div>
                      {p.addedNodes.length > 0 && (
                        <span className="font-mono text-[0.625rem] text-approve-600">
                          +{p.addedNodes.length} added
                        </span>
                      )}
                      {p.removedNodes.length > 0 && (
                        <span className="font-mono text-[0.625rem] text-reject-600">
                          −{p.removedNodes.length} removed
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel>
              <PanelHeader tone="sunken">
                <DraftingLabel size="sm" tone="primary">
                  L3 · INDIRECT IMPACT
                </DraftingLabel>
                <div className="flex-1" />
                <DraftingLabel size="xs">{delta.indirectImpactPaths.length}</DraftingLabel>
              </PanelHeader>
              {delta.indirectImpactPaths.length === 0 ? (
                <PanelBody>
                  <p className="text-sm text-text-tertiary" data-testid="comparison-indirect-empty">
                    No unchanged paths cross a contract change.
                  </p>
                </PanelBody>
              ) : (
                <ul className="divide-y divide-border" data-testid="comparison-indirect-list">
                  {delta.indirectImpactPaths.map((i) => (
                    <li key={i.headPathId} className="flex flex-col gap-0.5 px-3.5 py-2">
                      <div className="flex items-center gap-2">
                        <Chip variant="indirect-impact">INDIRECT</Chip>
                        <span className="font-mono text-xs text-text-tertiary">
                          path {i.headPathId.slice(0, 8)}
                        </span>
                      </div>
                      <span className="font-mono text-[0.625rem] text-text-tertiary">
                        crosses {i.contractChangeIds.length} change(s)
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
      </div>
    </main>
  );
}

function CallerSummary(props: {
  change: { readonly id: string };
  affected: ReadonlyArray<{
    readonly callerIdentity: string;
    readonly callerOnChangedPath: boolean;
    readonly callerOnAnyWalkedPath: boolean;
  }>;
}) {
  if (props.affected.length === 0) return null;
  const onChanged = props.affected.filter((a) => a.callerOnChangedPath).length;
  const onWalked = props.affected.filter(
    (a) => a.callerOnAnyWalkedPath && !a.callerOnChangedPath,
  ).length;
  const offWalked = props.affected.filter((a) => !a.callerOnAnyWalkedPath).length;
  return (
    <span className="font-mono text-[0.625rem] text-text-tertiary">
      {props.affected.length} caller(s) — {onChanged} on changed path, {onWalked} on walked,{' '}
      {offWalked} off
    </span>
  );
}
