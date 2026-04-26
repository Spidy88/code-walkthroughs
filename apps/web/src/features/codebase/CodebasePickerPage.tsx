import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import {
  DraftingLabel,
  Panel,
  PanelBody,
  PanelHeader,
  TitleBlock,
} from '../../components/blueprint/index.ts';
import { trpcClient } from '../../trpc.ts';

export function CodebasePickerPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const recent = useQuery({
    queryKey: ['codebase', 'listRecent'],
    queryFn: () => trpcClient.codebase.listRecent.query(),
  });

  const open = useMutation({
    mutationFn: (path: string) => trpcClient.codebase.open.mutate({ path }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['codebase'] });
      navigate({ to: '/codebase' });
    },
  });

  const switchTo = useMutation({
    mutationFn: (hash: string) => trpcClient.codebase.switch.mutate({ hash }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['codebase'] });
      navigate({ to: '/codebase' });
    },
  });

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-8">
        <TitleBlock
          drawingLabel="DRAWING · CODE_WALKTHROUGHS"
          title="Code Walkthroughs"
          tagline="Walk the path, not the diff."
          cells={[
            { label: 'DEV', value: 'local' },
            { label: 'REV', value: 'chunk-2' },
            { label: 'SHEET', value: 'picker' },
          ]}
        />
        <OpenCodebaseSection
          isPending={open.isPending}
          error={open.error}
          onSubmit={(path) => open.mutate(path)}
        />
        <RecentCodebasesSection
          recent={recent.data ?? null}
          isLoading={recent.isLoading}
          error={recent.error}
          onResume={(hash) => switchTo.mutate(hash)}
          isResuming={switchTo.isPending}
        />
      </div>
    </main>
  );
}

function OpenCodebaseSection(props: {
  onSubmit: (path: string) => void;
  isPending: boolean;
  error: unknown;
}) {
  const [value, setValue] = useState('');

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;
      props.onSubmit(trimmed);
    },
    [props, value],
  );

  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § A · OPEN A CODEBASE
      </DraftingLabel>
      <Panel>
        <PanelHeader>
          <DraftingLabel size="sm">FIG. A · ABSOLUTE PATH</DraftingLabel>
        </PanelHeader>
        <PanelBody>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <label className="block">
              <span className="block font-mono text-xs uppercase tracking-wider text-text-tertiary">
                Path on this machine
              </span>
              <input
                type="text"
                name="path"
                spellCheck={false}
                autoComplete="off"
                placeholder="/Users/you/projects/your-codebase"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                disabled={props.isPending}
                className="mt-1 block w-full border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-primary"
                data-testid="codebase-picker-path-input"
              />
              <span className="mt-1 block text-xs text-text-tertiary">
                Paste an absolute path. Drag-from-Finder support is post-v1.
              </span>
            </label>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={props.isPending || value.trim() === ''}
                className="border border-primary bg-primary px-4 py-1.5 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="codebase-picker-open-button"
              >
                {props.isPending ? 'OPENING…' : 'OPEN ↗'}
              </button>
              {props.error !== null && props.error !== undefined && (
                <span className="text-sm text-error" data-testid="codebase-picker-error">
                  {String((props.error as Error).message ?? props.error)}
                </span>
              )}
            </div>
          </form>
        </PanelBody>
      </Panel>
    </section>
  );
}

function RecentCodebasesSection(props: {
  recent: ReadonlyArray<{
    hash: string;
    absolutePath: string;
    label: string | null;
    lastOpenedAt: string;
  }> | null;
  isLoading: boolean;
  error: unknown;
  onResume: (hash: string) => void;
  isResuming: boolean;
}) {
  return (
    <section>
      <DraftingLabel size="sm" weight="bold" className="mb-2 block">
        § B · RECENT CODEBASES
      </DraftingLabel>
      <Panel>
        <PanelHeader>
          <DraftingLabel size="sm">FIG. B · KNOWN CODEBASES</DraftingLabel>
        </PanelHeader>
        {props.isLoading ? (
          <PanelBody>
            <div className="text-sm text-text-secondary">Loading…</div>
          </PanelBody>
        ) : props.error ? (
          <PanelBody>
            <div className="text-sm text-error">Failed to load recent codebases.</div>
          </PanelBody>
        ) : !props.recent || props.recent.length === 0 ? (
          <PanelBody>
            <div className="text-sm text-text-tertiary" data-testid="codebase-picker-empty">
              No codebases yet — open one above to get started.
            </div>
          </PanelBody>
        ) : (
          <ul className="divide-y divide-border" data-testid="codebase-picker-recent-list">
            {props.recent.map((row) => (
              <li
                key={row.hash}
                className="flex items-center gap-3 px-3.5 py-2"
                data-testid="codebase-picker-recent-row"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-text-primary truncate">
                    {row.label ?? row.absolutePath}
                  </div>
                  {row.label && (
                    <div className="font-mono text-xs text-text-tertiary truncate">
                      {row.absolutePath}
                    </div>
                  )}
                </div>
                <span className="font-mono text-xs text-text-tertiary">{row.hash}</span>
                <button
                  type="button"
                  onClick={() => props.onResume(row.hash)}
                  disabled={props.isResuming}
                  className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-60"
                >
                  RESUME ↗
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}
