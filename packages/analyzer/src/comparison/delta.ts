import type {
  AffectedCaller,
  ComparisonDelta,
  ContractChange,
  IndirectImpactPath,
  NodeSignature,
  PathDelta,
  PathDeltaClassification,
} from '@cw/shared';
import { hashCanonical } from '@cw/shared';
import type { AnalysisOutput } from '../types.ts';

/**
 * Computes the comparison delta between two analysis runs (base ref
 * + head ref). v1 covers:
 *   - export_added / export_removed contract changes (signature-level
 *     changes beyond exported flag are deferred — they require type
 *     access in the parser, tracked as a follow-up).
 *   - per-entry-point path deltas (unchanged / modified_in_place /
 *     net_new / net_gone).
 *   - affected callers per contract change, derived from head's
 *     call_edges.
 *   - indirect-impact paths per contract change.
 *
 * Path identity is keyed off entry.nodeIdentity (stable across runs)
 * so a single path "follows" the same entry across base + head even
 * though the materialised pathId is regenerated per run.
 */
export function computeComparisonDelta(input: {
  readonly base: AnalysisOutput;
  readonly head: AnalysisOutput;
}): ComparisonDelta {
  const baseSigs = signaturesFor(input.base);
  const headSigs = signaturesFor(input.head);

  const contractChanges: ContractChange[] = [];
  const allIdentities = new Set<string>([...baseSigs.keys(), ...headSigs.keys()]);
  for (const id of allIdentities) {
    const base = baseSigs.get(id) ?? null;
    const head = headSigs.get(id) ?? null;
    if (base === null && head !== null && head.exported) {
      contractChanges.push({
        id: hashCanonical({ kind: 'export_added', nodeIdentity: id }),
        nodeIdentity: id,
        kind: 'export_added',
        base: null,
        head,
        note: `${id.split(':').at(-1) ?? id} is exported in head, not in base`,
      });
    } else if (head === null && base !== null && base.exported) {
      contractChanges.push({
        id: hashCanonical({ kind: 'export_removed', nodeIdentity: id }),
        nodeIdentity: id,
        kind: 'export_removed',
        base,
        head: null,
        note: `${id.split(':').at(-1) ?? id} was exported in base, not in head`,
      });
    } else if (base !== null && head !== null && base.exported !== head.exported && head.exported) {
      contractChanges.push({
        id: hashCanonical({ kind: 'export_added', nodeIdentity: id }),
        nodeIdentity: id,
        kind: 'export_added',
        base,
        head,
        note: `${id.split(':').at(-1) ?? id} became exported`,
      });
    } else if (base !== null && head !== null && base.exported !== head.exported && base.exported) {
      contractChanges.push({
        id: hashCanonical({ kind: 'export_removed', nodeIdentity: id }),
        nodeIdentity: id,
        kind: 'export_removed',
        base,
        head,
        note: `${id.split(':').at(-1) ?? id} is no longer exported`,
      });
    }
  }

  // Path deltas keyed off entry.nodeIdentity so a path's identity
  // survives a re-analysis where the materialised pathId changes.
  const baseEntryByNode = new Map(input.base.entryPoints.map((e) => [e.nodeIdentity, e]));
  const headEntryByNode = new Map(input.head.entryPoints.map((e) => [e.nodeIdentity, e]));
  const basePathByEntry = new Map(input.base.paths.map((p) => [p.entryPointId, p]));
  const headPathByEntry = new Map(input.head.paths.map((p) => [p.entryPointId, p]));
  const baseNodesByPath = groupBy(input.base.pathNodes, (n) => n.pathId);
  const headNodesByPath = groupBy(input.head.pathNodes, (n) => n.pathId);

  const pathDeltas: PathDelta[] = [];
  const allEntryNodes = new Set<string>([...baseEntryByNode.keys(), ...headEntryByNode.keys()]);
  for (const entryNode of allEntryNodes) {
    const baseEntry = baseEntryByNode.get(entryNode);
    const headEntry = headEntryByNode.get(entryNode);
    const basePath = baseEntry ? basePathByEntry.get(baseEntry.id) : undefined;
    const headPath = headEntry ? headPathByEntry.get(headEntry.id) : undefined;
    const baseSeq = (basePath && baseNodesByPath.get(basePath.id)) || [];
    const headSeq = (headPath && headNodesByPath.get(headPath.id)) || [];
    const baseIds = baseSeq.map((n) => n.nodeIdentity);
    const headIds = headSeq.map((n) => n.nodeIdentity);
    let classification: PathDeltaClassification;
    if (!basePath) classification = 'net_new';
    else if (!headPath) classification = 'net_gone';
    else if (baseIds.join('→') === headIds.join('→')) classification = 'unchanged';
    else classification = 'modified_in_place';
    const added = headIds.filter((id) => !baseIds.includes(id));
    const removed = baseIds.filter((id) => !headIds.includes(id));
    pathDeltas.push({
      basePathId: basePath?.id ?? null,
      headPathId: headPath?.id ?? null,
      classification,
      addedNodes: added,
      removedNodes: removed,
    });
  }

  // Affected callers — head-side call_edges that target a contract
  // change's nodeIdentity.
  const headCallEdgesByCallee = new Map<string, { callerIdentity: string }[]>();
  for (const f of input.head.parsedFiles) {
    for (const e of f.callEdges) {
      if (!e.calleeIdentity) continue;
      const arr = headCallEdgesByCallee.get(e.calleeIdentity) ?? [];
      arr.push({ callerIdentity: e.callerIdentity });
      headCallEdgesByCallee.set(e.calleeIdentity, arr);
    }
  }
  const headPathNodeMembership = new Map<string, string[]>(); // identity -> head pathIds
  for (const n of input.head.pathNodes) {
    const arr = headPathNodeMembership.get(n.nodeIdentity) ?? [];
    arr.push(n.pathId);
    headPathNodeMembership.set(n.nodeIdentity, arr);
  }
  const changedHeadPathIds = new Set(
    pathDeltas
      .filter((d) => d.classification !== 'unchanged' && d.headPathId !== null)
      .map((d) => d.headPathId as string),
  );
  const affectedCallers: AffectedCaller[] = [];
  for (const change of contractChanges) {
    const callers = headCallEdgesByCallee.get(change.nodeIdentity) ?? [];
    for (const caller of callers) {
      const memberOf = headPathNodeMembership.get(caller.callerIdentity) ?? [];
      affectedCallers.push({
        contractChangeId: change.id,
        callerIdentity: caller.callerIdentity,
        callerOnAnyWalkedPath: memberOf.length > 0,
        callerOnChangedPath: memberOf.some((p) => changedHeadPathIds.has(p)),
      });
    }
  }

  // Indirect-impact: an unchanged head path that crosses a contract
  // change's nodeIdentity.
  const indirectImpactPaths: IndirectImpactPath[] = [];
  const unchangedHeadPathIds = new Set(
    pathDeltas
      .filter((d) => d.classification === 'unchanged' && d.headPathId !== null)
      .map((d) => d.headPathId as string),
  );
  const byHeadPath = new Map<string, Set<string>>();
  for (const change of contractChanges) {
    const memberOf = headPathNodeMembership.get(change.nodeIdentity) ?? [];
    for (const pathId of memberOf) {
      if (!unchangedHeadPathIds.has(pathId)) continue;
      const set = byHeadPath.get(pathId) ?? new Set<string>();
      set.add(change.id);
      byHeadPath.set(pathId, set);
    }
  }
  for (const [pathId, ids] of byHeadPath) {
    indirectImpactPaths.push({ headPathId: pathId, contractChangeIds: [...ids] });
  }

  return { contractChanges, affectedCallers, pathDeltas, indirectImpactPaths };
}

function signaturesFor(output: AnalysisOutput): Map<string, NodeSignature> {
  const m = new Map<string, NodeSignature>();
  for (const f of output.parsedFiles) {
    for (const node of f.nodes) {
      m.set(node.identity, {
        nodeIdentity: node.identity,
        exported: node.exported,
        params: '',
        returnType: '',
        contentHash: node.contentHash,
      });
    }
  }
  return m;
}

function groupBy<T, K>(arr: ReadonlyArray<T>, key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const existing = m.get(k);
    if (existing) existing.push(item);
    else m.set(k, [item]);
  }
  return m;
}
