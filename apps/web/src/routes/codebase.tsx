import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import { DraftingLabel, Panel, PanelBody, TitleBlock } from '../components/blueprint/index.ts';
import { trpcClient } from '../trpc.ts';

export const Route = createFileRoute('/codebase')({
  component: CodebaseOverviewPlaceholder,
});

/**
 * Placeholder route. The real codebase overview lands in chunks 3 and 4
 * (analysis progress + project overview). For now this just confirms the
 * tRPC round-trip and the navigation flow from the picker.
 */
function CodebaseOverviewPlaceholder() {
  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-6">
        <TitleBlock
          drawingLabel="DRAWING · CODEBASE"
          title="Codebase opened"
          tagline="Analysis progress + project overview ship in chunks 3 and 4."
          cells={[
            { label: 'DEV', value: 'local' },
            { label: 'REV', value: 'chunk-2' },
            { label: 'SHEET', value: 'placeholder' },
          ]}
        />
        <section>
          <DraftingLabel size="sm" weight="bold" className="mb-2 block">
            § A · ACTIVE CODEBASE
          </DraftingLabel>
          <Panel>
            <PanelBody>
              {status.isLoading ? (
                <div className="text-sm text-text-secondary">Loading…</div>
              ) : status.error ? (
                <div className="text-sm text-error">Failed to reach server.</div>
              ) : status.data?.active ? (
                <dl
                  className="grid grid-cols-[160px_1fr] gap-y-2 text-sm"
                  data-testid="codebase-overview-active"
                >
                  <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
                    PATH
                  </dt>
                  <dd className="font-mono text-text-primary break-all">
                    {status.data.active.absolutePath}
                  </dd>
                  <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
                    LLM ENABLED
                  </dt>
                  <dd className="text-text-primary">{status.data.llmEnabled ? 'yes' : 'no'}</dd>
                </dl>
              ) : (
                <div className="text-sm text-text-tertiary">No active codebase.</div>
              )}
            </PanelBody>
          </Panel>
        </section>
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
