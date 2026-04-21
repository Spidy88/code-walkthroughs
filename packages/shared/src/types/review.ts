import type { NodeIdentity } from './node.ts';

export const reviewStatuses = ['approved', 'rejected', 'info_requested'] as const;
export type ReviewStatus = (typeof reviewStatuses)[number];

export type StatusScope =
  | { readonly kind: 'global' }
  | { readonly kind: 'path'; readonly pathId: string };

export type ReviewStatusRow = {
  readonly id: string;
  readonly nodeIdentity: NodeIdentity;
  readonly scope: StatusScope;
  readonly status: ReviewStatus;
  readonly comment: string | null;
  readonly codeHash: string;
  readonly reviewerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ReviewHistoryRow = ReviewStatusRow & {
  readonly supersededAt: string;
};

export type NodeRuntimeState =
  | { readonly kind: 'never_reviewed' }
  | { readonly kind: 'reviewed_current'; readonly current: ReviewStatusRow }
  | {
      readonly kind: 'reviewed_stale';
      readonly prior: ReviewStatusRow;
      readonly stalenessDetectedAt: string;
    }
  | { readonly kind: 'info_requested'; readonly current: ReviewStatusRow };

export const commentAnchorKinds = ['file', 'function', 'line'] as const;
export type CommentAnchorKind = (typeof commentAnchorKinds)[number];

export type CommentAnchor =
  | { readonly kind: 'file'; readonly filePath: string }
  | { readonly kind: 'function'; readonly filePath: string; readonly functionIdentity: string }
  | {
      readonly kind: 'line';
      readonly filePath: string;
      readonly functionIdentity: string;
      readonly lineStart: number;
      readonly lineEnd: number;
    };

export type Comment = {
  readonly id: string;
  readonly anchor: CommentAnchor;
  readonly body: string;
  readonly reviewerId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
};
