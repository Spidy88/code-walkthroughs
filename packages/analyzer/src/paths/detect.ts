import type { ParseOutput } from '@cw/adapters';
import type { DetectedPath, EntryPoint, NodeIdentity, PathNode, PrepQuestion } from '@cw/shared';
import { hashCanonical } from '@cw/shared';

export type PathDetectionInput = {
  readonly entryPoints: readonly EntryPoint[];
  readonly files: readonly ParseOutput[];
  readonly projectId: string;
  readonly depthLimit?: number;
  readonly signal?: AbortSignal;
  /**
   * Reviewer's path_branch answers from prior runs, keyed by
   * branchKey(entryNodeIdentity, callerIdentity). When a caller has
   * multiple resolvable callees and an answer exists for it, the
   * picker uses the answer; otherwise it falls back to the first
   * resolvable callee, the same default the analyzer used before
   * Chunk 9B.
   */
  readonly branchAnswers?: ReadonlyMap<string, NodeIdentity>;
};

export type PathDetectionOutput = {
  readonly paths: readonly DetectedPath[];
  readonly pathNodes: readonly PathNode[];
  /**
   * `path_branch`-kind prep questions emitted whenever a path node had
   * more than one resolvable callee. Stable-keyed off the entry's node
   * identity so the question survives across analysis runs and the
   * answer in state.db keeps applying.
   */
  readonly branchQuestions: readonly PrepQuestion[];
};

const DEFAULT_DEPTH = 8;

/**
 * Deterministic categoriser used when the LLM categoriser is off
 * (the v1 default). Buckets paths by the basename of the entry's
 * source file so reviewers see "all order routes", "all session
 * routes", etc. — closer to feature grouping than HTTP-verb
 * grouping. Ordering is alphabetical; the LLM categoriser produces
 * better names + an intentional order when available.
 */
function deterministicCategoryFor(entry: EntryPoint): {
  category: string | null;
  categoryOrder: number | null;
} {
  // nodeIdentity is `<projectId>:<filePath>:<symbol>`. Pull the
  // basename without extension to use as the bucket label.
  const parts = entry.nodeIdentity.split(':');
  const filePath = parts.length >= 2 ? (parts[1] ?? '') : '';
  const fileName = filePath.split('/').at(-1) ?? '';
  const basename = fileName.replace(/\.[^.]+$/, '');
  const category = basename || 'other';
  // Alphabetical order; ties broken stably by the bucket name.
  const categoryOrder = category === 'other' ? 999 : category.charCodeAt(0);
  return { category, categoryOrder };
}

export function branchKey(entryNodeIdentity: NodeIdentity, callerIdentity: NodeIdentity): string {
  return hashCanonical({
    kind: 'path_branch',
    entryNodeIdentity,
    callerIdentity,
  });
}

export function detectPaths(input: PathDetectionInput): PathDetectionOutput {
  const depth = input.depthLimit ?? DEFAULT_DEPTH;
  const answers = input.branchAnswers ?? new Map<string, NodeIdentity>();

  const callEdgesByCaller = new Map<
    NodeIdentity,
    readonly { calleeIdentity: NodeIdentity | null }[]
  >();
  for (const file of input.files) {
    for (const edge of file.callEdges) {
      const list = callEdgesByCaller.get(edge.callerIdentity) ?? [];
      callEdgesByCaller.set(edge.callerIdentity, [
        ...list,
        { calleeIdentity: edge.calleeIdentity },
      ]);
    }
  }

  const knownNodes = new Set<NodeIdentity>();
  for (const file of input.files) {
    for (const node of file.nodes) knownNodes.add(node.identity);
  }

  const paths: DetectedPath[] = [];
  const pathNodes: PathNode[] = [];
  const branchQuestionsByKey = new Map<string, PrepQuestion>();
  const now = new Date().toISOString();

  for (const entry of input.entryPoints) {
    if (input.signal?.aborted) input.signal.throwIfAborted();

    // Stable pathId derived from the entry's nodeIdentity so URLs,
    // path-scoped review rows, and prep_question contexts all stay
    // valid across re-analyses. Without this, answering a
    // path_branch question (which triggers re-analysis) would
    // invalidate the walkthrough URL the reviewer is currently on.
    const pathId = hashCanonical({ kind: 'path', entryNodeIdentity: entry.nodeIdentity });
    const visited = new Set<NodeIdentity>();
    const ordered: NodeIdentity[] = [];
    const cycles = new Map<NodeIdentity, number>();

    let cursor: NodeIdentity | null = entry.nodeIdentity;
    let position = 0;
    let maxDepth = 0;

    while (cursor && position < depth) {
      maxDepth = position;
      if (visited.has(cursor)) {
        cycles.set(cursor, ordered.indexOf(cursor));
        break;
      }
      visited.add(cursor);
      ordered.push(cursor);

      // Collect every resolvable callee (cross-file or same-file
      // edges that point at a known node), deduped, in source order.
      const edges: readonly { calleeIdentity: NodeIdentity | null }[] =
        callEdgesByCaller.get(cursor) ?? [];
      const resolvedCallees: NodeIdentity[] = [];
      const seen = new Set<NodeIdentity>();
      for (const edge of edges) {
        const callee = edge.calleeIdentity;
        if (!callee || !knownNodes.has(callee)) continue;
        if (seen.has(callee)) continue;
        seen.add(callee);
        resolvedCallees.push(callee);
      }

      const callerIdentity = cursor;
      let next: NodeIdentity | null = null;
      if (resolvedCallees.length > 0) {
        if (resolvedCallees.length > 1) {
          // Branch — emit a prep question if we haven't already for
          // this entry+caller. Stable keys mean re-analyzing the same
          // codebase produces the same question key, so the
          // answer in state.db keeps applying.
          const key = branchKey(entry.nodeIdentity, callerIdentity);
          if (!branchQuestionsByKey.has(key)) {
            branchQuestionsByKey.set(key, {
              key,
              kind: 'path_branch',
              context: {
                kind: 'path_branch',
                pathId,
                callerIdentity,
                candidates: resolvedCallees,
              },
              suggestion: null,
              alternatives: [],
              createdAt: now,
            });
          }
          const answered = answers.get(key);
          // Honor the answer only if it's still a valid candidate —
          // a previously-chosen branch could have been deleted.
          next =
            answered && resolvedCallees.includes(answered)
              ? answered
              : (resolvedCallees[0] ?? null);
        } else {
          next = resolvedCallees[0] ?? null;
        }
      }

      cursor = next;
      position += 1;
    }

    const { category, categoryOrder } = deterministicCategoryFor(entry);
    paths.push({
      id: pathId,
      entryPointId: entry.id,
      projectId: input.projectId,
      nodeCount: ordered.length,
      maxDepth,
      category,
      categoryOrder,
    });

    ordered.forEach((nodeIdentity, index) => {
      pathNodes.push({
        pathId,
        position: index,
        nodeIdentity,
        forkGroup: null,
        changeKind: null,
        cycleBackToPosition: cycles.get(nodeIdentity) ?? null,
      });
    });
  }

  return { paths, pathNodes, branchQuestions: [...branchQuestionsByKey.values()] };
}
