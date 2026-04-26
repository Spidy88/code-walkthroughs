import { Link, createFileRoute, useParams } from '@tanstack/react-router';
import {
  DraftingLabel,
  Panel,
  PanelBody,
  TitleBlock,
} from '../../../components/blueprint/index.ts';

export const Route = createFileRoute('/project/$projectId/path/$pathId')({
  component: WalkthroughPlaceholder,
});

function WalkthroughPlaceholder() {
  const { projectId, pathId } = useParams({ from: '/project/$projectId/path/$pathId' });
  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-6">
        <TitleBlock
          drawingLabel="DRAWING · WALKTHROUGH"
          title="Walkthrough Canvas"
          tagline="The xyflow walkthrough surface ships in chunk 5."
          cells={[
            { label: 'PROJECT', value: projectId.slice(0, 8) },
            { label: 'PATH', value: pathId.slice(0, 8) },
            { label: 'SHEET', value: 'placeholder' },
          ]}
        />
        <DraftingLabel size="sm" weight="bold" className="block">
          § A · NOT YET IMPLEMENTED
        </DraftingLabel>
        <Panel>
          <PanelBody>
            <p className="text-sm text-text-secondary">
              Path detail rendering — the focused-node canvas with code, classification, checklist,
              and review actions — lands in chunk 5.
            </p>
            <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-1 text-sm">
              <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
                PROJECT
              </dt>
              <dd className="font-mono text-text-primary break-all">{projectId}</dd>
              <dt className="self-center font-mono text-xs uppercase tracking-wider text-text-tertiary">
                PATH
              </dt>
              <dd className="font-mono text-text-primary break-all">{pathId}</dd>
            </dl>
          </PanelBody>
        </Panel>
        <Link
          to="/project/$projectId"
          params={{ projectId }}
          className="inline-block border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
        >
          ← BACK TO OVERVIEW
        </Link>
      </div>
    </main>
  );
}
