import type { ParseOutput } from '@cw/adapters';
import type { NodeIdentity, PrepQuestion } from '@cw/shared';
import { hashCanonical } from '@cw/shared';

export type PriorAnalyzedNode = {
  readonly nodeIdentity: NodeIdentity;
  readonly filePath: string;
  readonly name: string;
  readonly kind: string;
};

export type RenameDetectionInput = {
  readonly priorNodes: ReadonlyArray<PriorAnalyzedNode>;
  readonly currentFiles: ReadonlyArray<ParseOutput>;
  /**
   * Levenshtein-style similarity threshold: 1 = identical names,
   * 0 = completely different. We require at least this score to emit
   * a rename candidate. 0.55 lets short names with a 1-char swap
   * through (e.g. listOrders → fetchOrders is ~0.55) while still
   * filtering out obvious mismatches.
   */
  readonly similarityThreshold?: number;
};

const DEFAULT_THRESHOLD = 0.55;

/**
 * Identifies "this looks like a rename" candidates by pairing nodes
 * present in the prior cache but missing from the current parse with
 * new nodes in the same file that weren't there before. Per spec
 * §13: similarity uses name + kind compatibility; full AST-shape +
 * signature match are TODOs that can refine the score later without
 * changing the surface.
 */
export function detectRenameCandidates(input: RenameDetectionInput): readonly PrepQuestion[] {
  const threshold = input.similarityThreshold ?? DEFAULT_THRESHOLD;
  const priorByFile = new Map<string, PriorAnalyzedNode[]>();
  for (const p of input.priorNodes) {
    const arr = priorByFile.get(p.filePath) ?? [];
    arr.push(p);
    priorByFile.set(p.filePath, arr);
  }

  const currentIdentities = new Set<NodeIdentity>();
  const currentByFile = new Map<string, ParseOutput>();
  for (const f of input.currentFiles) {
    currentByFile.set(f.file.path, f);
    for (const node of f.nodes) currentIdentities.add(node.identity);
  }

  const priorIdentities = new Set<NodeIdentity>(input.priorNodes.map((p) => p.nodeIdentity));

  const now = new Date().toISOString();
  const candidates: PrepQuestion[] = [];

  for (const [filePath, priorList] of priorByFile) {
    const removed = priorList.filter((p) => !currentIdentities.has(p.nodeIdentity));
    if (removed.length === 0) continue;
    const currentFile = currentByFile.get(filePath);
    if (!currentFile) {
      // Whole file is gone. Renames are scoped to a file in v1; the
      // file-level disappearance is handled by the orphan-archival
      // pass elsewhere.
      continue;
    }
    const newNodes = currentFile.nodes.filter((n) => !priorIdentities.has(n.identity));
    if (newNodes.length === 0) continue;

    // Pair each removed-old with its best matching new node by name
    // similarity, filtering by kind compatibility and minimum score.
    // O(n*m) is fine — a single file rarely has more than a handful
    // of removed/added functions in one analysis pass.
    for (const old of removed) {
      let best: { node: (typeof newNodes)[number]; score: number } | null = null;
      for (const fresh of newNodes) {
        if (fresh.kind !== old.kind) continue;
        const score = nameSimilarity(old.name, fresh.name);
        if (best === null || score > best.score) {
          best = { node: fresh, score };
        }
      }
      if (best && best.score >= threshold) {
        candidates.push({
          key: hashCanonical({
            kind: 'rename',
            oldIdentity: old.nodeIdentity,
            newIdentity: best.node.identity,
          }),
          kind: 'rename',
          context: {
            kind: 'rename',
            oldIdentity: old.nodeIdentity,
            newIdentity: best.node.identity,
            similarity: best.score,
          },
          suggestion: null,
          alternatives: [],
          createdAt: now,
        });
      }
    }
  }

  return candidates;
}

/**
 * Normalised Levenshtein similarity, 0..1. We split on common
 * separators (`_`, casing) and treat tokens as the comparison unit
 * so that `listOrders` ↔ `fetchOrders` scores higher than a raw
 * character distance would suggest.
 */
function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const tokensA = tokenise(a);
  const tokensB = tokenise(b);
  // Token-overlap ratio (Jaccard) gives partial credit for shared
  // words even when a leading verb changed.
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

function tokenise(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\s\-.]/)
    .filter((t) => t.length > 0);
}
