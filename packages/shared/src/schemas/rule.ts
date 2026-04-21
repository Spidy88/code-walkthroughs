import { z } from 'zod';
import { ruleResultKinds, ruleScopes, ruleTiers } from '../types/rule.ts';
import { classificationSchema } from './classification.ts';

export const ruleTierSchema = z.enum(ruleTiers);
export const ruleScopeSchema = z.enum(ruleScopes);
export const ruleResultKindSchema = z.enum(ruleResultKinds);

export const ruleDefinitionSchema = z.discriminatedUnion('tier', [
  z.object({
    tier: z.literal('builtin'),
    name: z.string().min(1),
    options: z.record(z.unknown()).optional(),
  }),
  z.object({
    tier: z.literal('shell'),
    command: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
  }),
  z.object({
    tier: z.literal('llm'),
    promptTemplate: z.string().min(1),
    model: z.string().optional(),
  }),
]);

export const ruleSchema = z.object({
  id: z.string().min(1),
  scope: ruleScopeSchema,
  classification: classificationSchema,
  title: z.string().min(1).max(200),
  definition: ruleDefinitionSchema,
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRuleInputSchema = z.object({
  scope: ruleScopeSchema,
  classification: classificationSchema,
  title: z.string().min(1).max(200),
  definition: ruleDefinitionSchema,
  enabled: z.boolean().default(true),
});

export type CreateRuleInput = z.infer<typeof createRuleInputSchema>;

export const shellRuleIoSchema = z.object({
  node: z.object({
    identity: z.string(),
    filePath: z.string(),
    classification: classificationSchema,
    code: z.string(),
    framework: z.string().nullable(),
    metadata: z.record(z.unknown()),
  }),
  rule: z.object({
    id: z.string(),
    title: z.string(),
    options: z.record(z.unknown()).optional(),
  }),
});

export const shellRuleResponseSchema = z.object({
  kind: z.enum(['pass', 'fail', 'skip']),
  message: z.string().max(2000).optional(),
});
