/**
 * Default checklists per classification. Mirrors the illustrative set in
 * the product spec §9.1. Items are static strings for chunk 5.5 — the
 * real rule-engine + per-rule pass/fail evaluation lands in chunk 15.
 *
 * Until then, every item is 'unchecked' per the LLM degradation contract:
 * the check has not run, so we don't claim pass or fail.
 */

export type DefaultChecklistItem = {
  readonly label: string;
  readonly state: 'unchecked';
};

export type DefaultChecklist = {
  readonly classification: string;
  readonly items: ReadonlyArray<DefaultChecklistItem>;
};

const ITEMS = (labels: ReadonlyArray<string>): DefaultChecklist['items'] =>
  labels.map((label) => ({ label, state: 'unchecked' as const }));

const FALLBACK_ITEMS = ITEMS([
  'Single responsibility — does one thing',
  'Boundary clarity — inputs / outputs are explicit',
  'Error handling',
]);

export const DEFAULT_CHECKLISTS: Record<string, DefaultChecklist['items']> = {
  route_handler: ITEMS([
    'Authentication checked before reaching this handler',
    'Authorization (role / ownership) checked',
    'Input validated against a schema',
    'Errors handled consistently with the rest of the API',
    'Response shape matches the documented contract',
  ]),
  service: ITEMS([
    'Single responsibility',
    'Caching / performance considerations',
    'Side-effect boundaries are clear',
    'Errors propagate cleanly',
  ]),
  client: ITEMS([
    'Timeout and retry policy',
    'Response validation against an expected shape',
    'Error mapping to caller-relevant errors',
  ]),
  repository: ITEMS([
    'Single responsibility — narrow data access',
    'Query inputs are typed / validated',
    'Errors map to a domain error, not a raw DB error',
  ]),
  helper: ITEMS([
    'Pure / side-effect-free where possible',
    'Inputs / outputs documented or obvious',
  ]),
  middleware: ITEMS([
    'Calls next() exactly once on the success path',
    'Errors propagate to the framework error handler',
    'Does not leak internal state into the response',
  ]),
  component: ITEMS([
    'Prop contract is typed and complete',
    'Accessibility — keyboard, ARIA, focus order',
    'Memoization where re-render cost matters',
    'Side-effect management (useEffect deps, cleanup)',
  ]),
  page: ITEMS([
    'Loading / error / empty states handled',
    'Suspense / data dependencies are explicit',
    'Accessibility — landmarks and headings',
  ]),
  hook: ITEMS([
    'Single responsibility',
    'Stable identity (deps are correct)',
    'Cleanup on unmount where applicable',
  ]),
  config: ITEMS([
    'Secrets not committed',
    'Environment separation (dev / prod) is honoured',
    'Sane defaults',
  ]),
  script: ITEMS([
    'Idempotent or guards against re-run damage',
    'Logs intent before mutating state',
  ]),
  seed: ITEMS(['Deterministic', 'Idempotent or wraps in a transaction']),
  fixture: ITEMS([
    'Realistic — exercises the real shape of the data',
    'Limited scope — one fixture, one purpose',
  ]),
  test: ITEMS([
    'Tests behavior, not implementation',
    'AAA structure',
    'No shared mutable state across tests',
  ]),
  type_only: ITEMS([
    'Names match the runtime shapes they describe',
    'No runtime code in this file',
  ]),
  unclassified: FALLBACK_ITEMS,
};

export function getDefaultChecklist(classification: string | null | undefined): {
  readonly classification: string;
  readonly items: DefaultChecklist['items'];
} {
  if (!classification) {
    return {
      classification: 'unclassified',
      items: DEFAULT_CHECKLISTS.unclassified ?? FALLBACK_ITEMS,
    };
  }
  const items = DEFAULT_CHECKLISTS[classification];
  return {
    classification,
    items: items ?? FALLBACK_ITEMS,
  };
}
