import { z } from 'zod';
import { commentAnchorKinds, reviewStatuses } from '../types/review.ts';

export const reviewStatusSchema = z.enum(reviewStatuses);

export const statusScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('global') }),
  z.object({ kind: z.literal('path'), pathId: z.string().min(1) }),
]);

export const setStatusInputSchema = z
  .object({
    nodeIdentity: z.string().min(1),
    status: reviewStatusSchema,
    comment: z.string().max(4000).optional(),
    pathScope: z.string().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.status === 'info_requested' && !input.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'comment is required for info_requested',
      });
    }
  });

export type SetStatusInput = z.infer<typeof setStatusInputSchema>;

export const clearStatusInputSchema = z.object({
  nodeIdentity: z.string().min(1),
  pathScope: z.string().min(1).optional(),
});

export type ClearStatusInput = z.infer<typeof clearStatusInputSchema>;

/**
 * Lift a path-scoped review status to global. The reviewer chose to
 * apply the same call, just made for one path, to every other path
 * that crosses this node — explicit opt-in per spec §8.4.
 */
export const promoteScopedApprovalInputSchema = z.object({
  nodeIdentity: z.string().min(1),
  pathId: z.string().min(1),
});

export type PromoteScopedApprovalInput = z.infer<typeof promoteScopedApprovalInputSchema>;

export const fileCascadeResolutionSchema = z.enum(['preserve', 'override']);

export const setFileStatusInputSchema = z
  .object({
    filePath: z.string().min(1),
    status: reviewStatusSchema,
    comment: z.string().max(4000).optional(),
    conflictResolution: fileCascadeResolutionSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (input.status === 'info_requested' && !input.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['comment'],
        message: 'comment is required for info_requested',
      });
    }
  });

export type SetFileStatusInput = z.infer<typeof setFileStatusInputSchema>;

export const commentAnchorKindSchema = z.enum(commentAnchorKinds);

export const commentAnchorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file'), filePath: z.string().min(1) }),
  z.object({
    kind: z.literal('function'),
    filePath: z.string().min(1),
    functionIdentity: z.string().min(1),
  }),
  z.object({
    kind: z.literal('line'),
    filePath: z.string().min(1),
    functionIdentity: z.string().min(1),
    lineStart: z.number().int().positive(),
    lineEnd: z.number().int().positive(),
  }),
]);

export const addCommentInputSchema = z.object({
  anchor: commentAnchorSchema,
  body: z.string().min(1).max(10000),
});

export type AddCommentInput = z.infer<typeof addCommentInputSchema>;

export const updateCommentInputSchema = z.object({
  id: z.string().min(1),
  body: z.string().min(1).max(10000),
});

export type UpdateCommentInput = z.infer<typeof updateCommentInputSchema>;

export const deleteCommentInputSchema = z.object({
  id: z.string().min(1),
});

export type DeleteCommentInput = z.infer<typeof deleteCommentInputSchema>;

export const listCommentsInputSchema = commentAnchorSchema;
export type ListCommentsInput = z.infer<typeof listCommentsInputSchema>;

export const listFunctionCommentsInputSchema = z.object({
  filePath: z.string().min(1),
  functionIdentity: z.string().min(1),
});
export type ListFunctionCommentsInput = z.infer<typeof listFunctionCommentsInputSchema>;
