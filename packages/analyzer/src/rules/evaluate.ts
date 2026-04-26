import type { ParseOutput } from '@cw/adapters';
import type { Classification, RuleResult, RuleResultKind } from '@cw/shared';
import type { ClassificationResult } from '../types.ts';

/**
 * A built-in rule. v1 uses purely deterministic heuristics — no LLM,
 * no shell. Each rule:
 *   - Targets one classification (e.g. route_handler).
 *   - Has a stable id used as the rule_results.rule_id key, plus a
 *     human-readable label for the checklist sidebar.
 *   - evaluate() returns 'pass' | 'fail' | 'skip' | 'unchecked',
 *     plus an optional short message explaining the verdict.
 *
 * Rules are intentionally narrow: each one checks a single concrete
 * thing. The checklist labels (in the web app) are the user-facing
 * surface; rule ids are the persistent key.
 */
export type BuiltinRule = {
  readonly id: string;
  readonly classification: Classification;
  readonly label: string;
  evaluate(input: BuiltinRuleInput): { kind: RuleResultKind; message?: string };
};

export type BuiltinRuleInput = {
  readonly node: ParseOutput['nodes'][number];
  readonly file: ParseOutput;
  readonly classification: ClassificationResult | null;
};

const AUTH_NAME_PATTERN = /^(authenticate|authorize|requireAuth|isAuthenticated|verifyAuth)/i;
const VALIDATION_NAME_PATTERN = /^(validate|parse|check|sanitize|coerce|schema)/i;

const ROUTE_HANDLER_AUTH: BuiltinRule = {
  id: 'builtin:route_handler:auth_check_present',
  classification: 'route_handler',
  label: 'Authentication checked before reaching this handler',
  evaluate({ node, file }) {
    // Either the function calls something auth-shaped directly, or
    // any of its callees does. We only check direct callees in v1
    // — full transitive closure is overkill for this surface.
    const directCalls = file.callEdges.filter((e) => e.callerIdentity === node.identity);
    const calls = directCalls
      .map((e) => e.calleeIdentity ?? '')
      .map((id) => id.split(':').at(-1) ?? '');
    const matched = calls.find((name) => AUTH_NAME_PATTERN.test(name));
    if (matched) return { kind: 'pass', message: `calls ${matched}` };
    // Express-style: app.use(authenticate) before the handler is
    // mounted. We can't check globally without project-wide flow
    // analysis, so fall back to skip rather than fail.
    return { kind: 'skip', message: 'no in-handler auth call detected' };
  },
};

const ROUTE_HANDLER_INPUT_VALIDATION: BuiltinRule = {
  id: 'builtin:route_handler:input_validated',
  classification: 'route_handler',
  label: 'Input validated against a schema',
  evaluate({ node, file }) {
    const directCalls = file.callEdges.filter((e) => e.callerIdentity === node.identity);
    const callNames = directCalls
      .map((e) => e.calleeIdentity ?? '')
      .map((id) => id.split(':').at(-1) ?? '');
    if (callNames.some((name) => VALIDATION_NAME_PATTERN.test(name))) {
      return { kind: 'pass', message: 'invokes a validate/parse/check call' };
    }
    return { kind: 'fail', message: 'no validate/parse/check call detected in body' };
  },
};

const SERVICE_SINGLE_RESPONSIBILITY: BuiltinRule = {
  id: 'builtin:service:single_responsibility',
  classification: 'service',
  label: 'Single responsibility',
  evaluate({ node, file }) {
    // Heuristic: a service function with > 8 distinct resolved
    // callees is doing a lot. Tune later — the threshold is the
    // checklist's "feels off" line.
    const distinctCallees = new Set(
      file.callEdges
        .filter((e) => e.callerIdentity === node.identity && !e.unresolved && e.calleeIdentity)
        .map((e) => e.calleeIdentity),
    );
    if (distinctCallees.size > 8) {
      return {
        kind: 'fail',
        message: `${distinctCallees.size} distinct callees — split this up?`,
      };
    }
    return { kind: 'pass', message: `${distinctCallees.size} callees, in budget` };
  },
};

const REPOSITORY_NARROW_DATA_ACCESS: BuiltinRule = {
  id: 'builtin:repository:narrow_data_access',
  classification: 'repository',
  label: 'Single responsibility — narrow data access',
  evaluate({ node, file }) {
    // Heuristic: repos should mostly issue one query per function.
    const directCalls = file.callEdges.filter((e) => e.callerIdentity === node.identity);
    if (directCalls.length === 0) {
      return { kind: 'skip', message: 'no calls observed (data access via direct expression?)' };
    }
    if (directCalls.length > 4) {
      return { kind: 'fail', message: `${directCalls.length} calls — wider than a single query` };
    }
    return { kind: 'pass', message: `${directCalls.length} calls, narrow` };
  },
};

const TEST_HAS_ASSERTION: BuiltinRule = {
  id: 'builtin:test:has_assertion',
  classification: 'test',
  label: 'Test has at least one assertion',
  evaluate({ node, file }) {
    const directCalls = file.callEdges.filter((e) => e.callerIdentity === node.identity);
    const callNames = directCalls
      .map((e) => e.calleeIdentity ?? '')
      .map((id) => id.split(':').at(-1) ?? '');
    if (callNames.some((name) => /^(expect|assert|t)$/i.test(name) || /^expect$/.test(name))) {
      return { kind: 'pass' };
    }
    return { kind: 'skip', message: 'no obvious assertion call detected' };
  },
};

const RULES: BuiltinRule[] = [
  ROUTE_HANDLER_AUTH,
  ROUTE_HANDLER_INPUT_VALIDATION,
  SERVICE_SINGLE_RESPONSIBILITY,
  REPOSITORY_NARROW_DATA_ACCESS,
  TEST_HAS_ASSERTION,
];

export function listBuiltinRules(): readonly BuiltinRule[] {
  return RULES;
}

export function evaluateBuiltinRules(input: {
  readonly classifications: readonly ClassificationResult[];
  readonly parsedFiles: readonly ParseOutput[];
}): readonly RuleResult[] {
  const classByIdentity = new Map(input.classifications.map((c) => [c.nodeIdentity, c]));
  const results: RuleResult[] = [];
  const ts = new Date().toISOString();
  for (const file of input.parsedFiles) {
    for (const node of file.nodes) {
      const cls = classByIdentity.get(node.identity) ?? null;
      if (!cls) continue;
      for (const rule of RULES) {
        if (rule.classification !== cls.classification) continue;
        const verdict = rule.evaluate({ node, file, classification: cls });
        results.push({
          ruleId: rule.id,
          nodeIdentity: node.identity,
          kind: verdict.kind,
          message: verdict.message ?? null,
          evaluatedAt: ts,
        });
      }
    }
  }
  return results;
}
