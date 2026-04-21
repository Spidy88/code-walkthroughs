import { z } from 'zod';

export const openCodebaseInputSchema = z.object({
  path: z.string().min(1),
});

export type OpenCodebaseInput = z.infer<typeof openCodebaseInputSchema>;

export const setLabelInputSchema = z.object({
  hash: z.string().min(1),
  label: z.string().max(200).nullable(),
});

export type SetLabelInput = z.infer<typeof setLabelInputSchema>;

export const setComparisonInputSchema = z
  .object({
    baseRef: z.string().min(1),
    headRef: z.string().min(1),
  })
  .nullable();

export type SetComparisonInput = z.infer<typeof setComparisonInputSchema>;

export const reanalyzeInputSchema = z
  .object({
    force: z.boolean().optional(),
    scope: z.enum(['full', 'classifications', 'paths', 'llm']).optional(),
  })
  .optional();

export type ReanalyzeInput = z.infer<typeof reanalyzeInputSchema>;
