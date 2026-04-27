import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

type RuleRow = {
  readonly id: string;
  readonly classification: string;
  readonly title: string;
  readonly tier: 'builtin' | 'shell' | 'llm';
  readonly enabled: boolean;
  readonly definition: unknown;
};

const TIER_VARIANT: Record<RuleRow['tier'], ChipVariant> = {
  builtin: 'page',
  shell: 'service',
  llm: 'component',
};

export function RulesPage() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['app', 'status'],
    queryFn: () => trpcClient.app.status.query(),
  });
  const rulesQuery = useQuery({
    queryKey: ['rule', 'list'],
    queryFn: () => trpcClient.rule.list.query(),
    enabled: status.data?.active != null,
  });
  const createMutation = useMutation({
    mutationFn: (input: {
      classification: string;
      title: string;
      definition: unknown;
    }) =>
      trpcClient.rule.create.mutate({
        scope: 'project',
        classification: input.classification,
        title: input.title,
        definition: input.definition as never,
      }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rule', 'list'] });
    },
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => trpcClient.rule.remove.mutate({ id }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rule', 'list'] });
    },
  });

  if (status.isLoading) return <Centered label="Loading…" />;
  if (!status.data?.active)
    return <Centered label="No active codebase — open one from the picker." tone="error" />;

  const rules = (rulesQuery.data ?? []) as ReadonlyArray<RuleRow>;
  const projectId = status.data.active.hash;

  return (
    <main className="dot-grid min-h-screen p-8">
      <div className="mx-auto max-w-[1024px] space-y-4">
        <TitleBlock
          drawingLabel="DRAWING · RULES"
          title="Rules"
          tagline="Author shell or LLM rules to extend the deterministic checklist set."
          cells={[
            { label: 'TOTAL', value: String(rules.length) },
            { label: 'ENABLED', value: String(rules.filter((r) => r.enabled).length) },
            { label: 'SCOPE', value: 'project' },
          ]}
        />
        <div className="flex items-center gap-3">
          <Link
            to="/project/$projectId"
            params={{ projectId }}
            className="border border-primary bg-transparent px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-primary hover:bg-primary-soft"
          >
            ← OVERVIEW
          </Link>
        </div>
        <RuleAuthor
          isPending={createMutation.isPending}
          error={createMutation.error}
          onCreate={(input) => createMutation.mutate(input)}
        />
        <Panel>
          <PanelHeader tone="sunken">
            <DraftingLabel size="sm">FIG. R · PROJECT RULES</DraftingLabel>
            <div className="flex-1" />
            <DraftingLabel size="xs">{rules.length}</DraftingLabel>
          </PanelHeader>
          {rules.length === 0 ? (
            <PanelBody>
              <p className="text-sm text-text-tertiary" data-testid="rules-empty">
                No project rules yet. Built-in rules ship with the analyzer; add shell or LLM rules
                to extend the checklist for this codebase.
              </p>
            </PanelBody>
          ) : (
            <ul className="divide-y divide-border" data-testid="rules-list">
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-3.5 py-2"
                  data-testid={`rules-row-${r.id}`}
                >
                  <Chip variant={TIER_VARIANT[r.tier]}>{r.tier.toUpperCase()}</Chip>
                  <DraftingLabel size="xs">{r.classification.toUpperCase()}</DraftingLabel>
                  <span className="flex-1 font-mono text-sm text-text-primary truncate">
                    {r.title}
                  </span>
                  {!r.enabled && <DraftingLabel size="xs">DISABLED</DraftingLabel>}
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(r.id)}
                    disabled={removeMutation.isPending}
                    className="border border-reject-600 bg-transparent px-2 py-0.5 font-mono text-xs uppercase tracking-widest text-reject-600 hover:bg-reject-soft disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid={`rules-remove-${r.id}`}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </main>
  );
}

function RuleAuthor(props: {
  isPending: boolean;
  error: unknown;
  onCreate: (input: { classification: string; title: string; definition: unknown }) => void;
}) {
  const [tier, setTier] = useState<'shell' | 'llm'>('shell');
  const [classification, setClassification] = useState('route_handler');
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [promptTemplate, setPromptTemplate] = useState('');

  const canSubmit =
    title.trim().length > 0 &&
    classification.trim().length > 0 &&
    (tier === 'shell' ? command.trim().length > 0 : promptTemplate.trim().length > 0);

  return (
    <Panel>
      <PanelHeader tone="sunken">
        <DraftingLabel size="sm">FIG. A · AUTHOR A RULE</DraftingLabel>
      </PanelHeader>
      <PanelBody>
        <div className="grid grid-cols-[140px_1fr] items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-widest text-text-tertiary">
            Tier
          </span>
          <div className="flex items-center gap-2">
            {(['shell', 'llm'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                className={[
                  'border px-3 py-1 font-mono text-xs uppercase tracking-widest',
                  tier === t
                    ? 'border-primary bg-primary text-text-inverse'
                    : 'border-border-strong bg-surface text-text-primary',
                ].join(' ')}
                data-testid={`rules-author-tier-${t}`}
              >
                {t}
              </button>
            ))}
          </div>
          <span className="font-mono text-xs uppercase tracking-widest text-text-tertiary">
            Classification
          </span>
          <input
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
            disabled={props.isPending}
            className="border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-primary"
            data-testid="rules-author-classification"
          />
          <span className="font-mono text-xs uppercase tracking-widest text-text-tertiary">
            Title
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={props.isPending}
            placeholder="e.g. response shape uses zod schema"
            className="border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-primary"
            data-testid="rules-author-title"
          />
          {tier === 'shell' ? (
            <>
              <span className="self-start font-mono text-xs uppercase tracking-widest text-text-tertiary">
                Shell
              </span>
              <textarea
                rows={3}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                disabled={props.isPending}
                placeholder="e.g. node ./scripts/check-rule.js"
                className="border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-primary"
                data-testid="rules-author-command"
              />
            </>
          ) : (
            <>
              <span className="self-start font-mono text-xs uppercase tracking-widest text-text-tertiary">
                Prompt
              </span>
              <textarea
                rows={3}
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                disabled={props.isPending}
                placeholder="e.g. Does this {{classification}} validate its input?"
                className="border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-primary"
                data-testid="rules-author-prompt"
              />
            </>
          )}
        </div>
        {props.error !== null && props.error !== undefined && (
          <div className="mt-2 text-sm text-error" data-testid="rules-author-error">
            {String((props.error as Error).message ?? props.error)}
          </div>
        )}
      </PanelBody>
      <div className="flex justify-end border-t border-border bg-surface-sunken px-3.5 py-2">
        <button
          type="button"
          onClick={() => {
            const definition =
              tier === 'shell'
                ? { tier: 'shell' as const, command: command.trim() }
                : { tier: 'llm' as const, promptTemplate: promptTemplate.trim() };
            props.onCreate({
              classification: classification.trim(),
              title: title.trim(),
              definition,
            });
            setTitle('');
            setCommand('');
            setPromptTemplate('');
          }}
          disabled={props.isPending || !canSubmit}
          className="border border-primary bg-primary px-3 py-1 font-mono text-xs font-semibold uppercase tracking-widest text-text-inverse hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="rules-author-submit"
        >
          Create rule
        </button>
      </div>
    </Panel>
  );
}

function Centered(props: { label: string; tone?: 'tertiary' | 'error' }) {
  return (
    <main className="dot-grid flex min-h-screen items-center justify-center p-8">
      <div className={props.tone === 'error' ? 'text-error' : 'text-text-tertiary'}>
        {props.label}
      </div>
    </main>
  );
}
