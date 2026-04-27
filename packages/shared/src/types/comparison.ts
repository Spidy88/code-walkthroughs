import type { NodeIdentity } from './node.ts';

export type NodeSignature = {
  readonly nodeIdentity: NodeIdentity;
  readonly exported: boolean;
  /** Parameter types as a comma-joined string for cheap diffability. */
  readonly params: string;
  readonly returnType: string;
  readonly contentHash: string;
};

export const contractChangeKinds = [
  'export_added',
  'export_removed',
  'param_added',
  'param_removed',
  'param_type_changed',
  'return_type_changed',
] as const;
export type ContractChangeKind = (typeof contractChangeKinds)[number];

export type ContractChange = {
  readonly id: string;
  readonly nodeIdentity: NodeIdentity;
  readonly kind: ContractChangeKind;
  readonly base: NodeSignature | null;
  readonly head: NodeSignature | null;
  readonly note: string;
};

export type AffectedCaller = {
  readonly contractChangeId: string;
  readonly callerIdentity: NodeIdentity;
  readonly callerOnAnyWalkedPath: boolean;
  readonly callerOnChangedPath: boolean;
};

export const pathDeltaClassifications = [
  'net_new',
  'net_gone',
  'modified_in_place',
  'restructured',
  'unchanged',
] as const;
export type PathDeltaClassification = (typeof pathDeltaClassifications)[number];

export type PathDelta = {
  readonly basePathId: string | null;
  readonly headPathId: string | null;
  readonly classification: PathDeltaClassification;
  readonly addedNodes: readonly NodeIdentity[];
  readonly removedNodes: readonly NodeIdentity[];
};

export type IndirectImpactPath = {
  readonly headPathId: string;
  readonly contractChangeIds: readonly string[];
};

export type ComparisonDelta = {
  readonly contractChanges: readonly ContractChange[];
  readonly affectedCallers: readonly AffectedCaller[];
  readonly pathDeltas: readonly PathDelta[];
  readonly indirectImpactPaths: readonly IndirectImpactPath[];
};
