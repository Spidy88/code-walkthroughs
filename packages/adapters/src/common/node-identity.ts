import type { NodeIdentity } from '@cw/shared';

export function makeNodeIdentity(
  projectId: string,
  filePath: string,
  symbolPath: string,
): NodeIdentity {
  return `${projectId}:${filePath}:${symbolPath}`;
}

export function parseNodeIdentity(identity: NodeIdentity): {
  projectId: string;
  filePath: string;
  symbolPath: string;
} | null {
  const firstColon = identity.indexOf(':');
  if (firstColon === -1) return null;
  const lastColon = identity.lastIndexOf(':');
  if (lastColon === firstColon) return null;
  const projectId = identity.slice(0, firstColon);
  const filePath = identity.slice(firstColon + 1, lastColon);
  const symbolPath = identity.slice(lastColon + 1);
  return { projectId, filePath, symbolPath };
}
