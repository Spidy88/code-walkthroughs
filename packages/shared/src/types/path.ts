import type { NodeIdentity } from './node.ts';

export type PathId = string;
export type EntryPointId = string;

export const entryPointKinds = [
  'http_route',
  'cli_command',
  'job',
  'event_handler',
  'frontend_route',
  'pinned',
] as const;
export type EntryPointKind = (typeof entryPointKinds)[number];

export type EntryPoint = {
  readonly id: EntryPointId;
  readonly kind: EntryPointKind;
  readonly framework: string;
  readonly projectId: string;
  readonly nodeIdentity: NodeIdentity;
  readonly metadata: Readonly<Record<string, unknown>>;
};

export type PathNode = {
  readonly pathId: PathId;
  readonly position: number;
  readonly nodeIdentity: NodeIdentity;
  readonly forkGroup: number | null;
  readonly changeKind: 'new' | 'modified' | 'renamed' | 'unchanged_context' | null;
  readonly cycleBackToPosition: number | null;
};

export type DetectedPath = {
  readonly id: PathId;
  readonly entryPointId: EntryPointId;
  readonly projectId: string;
  readonly nodeCount: number;
  readonly maxDepth: number;
  readonly category: string | null;
  readonly categoryOrder: number | null;
};

export const preambleRoles = [
  'app_mount',
  'global_middleware',
  'provider',
  'router',
  'dispatcher',
] as const;
export type PreambleRole = (typeof preambleRoles)[number];

export type PreambleNode = {
  readonly nodeIdentity: NodeIdentity;
  readonly role: PreambleRole;
  readonly summary: string | null;
};

export type Preamble = {
  readonly entryPointId: EntryPointId;
  readonly environmental: readonly PreambleNode[];
  readonly dispatcher: PreambleNode | null;
};
