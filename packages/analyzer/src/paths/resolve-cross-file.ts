import type { CallEdge, ParseOutput } from '@cw/adapters';
import type { NodeIdentity } from '@cw/shared';

/**
 * Walks every parsed file's call edges and rewrites cross-file edges
 * (`unresolvedHint: 'cross-file-or-external'`) to resolved edges when the
 * called name is imported from another local file in the project.
 *
 * Returns a new array of ParseOutput; the input is not mutated.
 */
export function resolveCrossFileCallEdges(
  parsedFiles: ReadonlyArray<ParseOutput>,
): ReadonlyArray<ParseOutput> {
  const filesByPath = new Map<string, ParseOutput>();
  for (const f of parsedFiles) filesByPath.set(f.file.path, f);

  // file path → map of exported name → resolved NodeIdentity
  const exportedByFile = new Map<string, Map<string, NodeIdentity>>();
  for (const f of parsedFiles) {
    const m = new Map<string, NodeIdentity>();
    for (const exp of f.exports) {
      if (exp.nodeIdentity) m.set(exp.name, exp.nodeIdentity);
    }
    exportedByFile.set(f.file.path, m);
  }

  return parsedFiles.map((file) => {
    // Per-file: imported local name → file path of source module
    const importToSource = new Map<string, string>();
    for (const imp of file.imports) {
      const resolved = resolveModulePath(file.file.path, imp.from, filesByPath);
      if (!resolved) continue;
      for (const spec of imp.specifiers) {
        if (spec === '*' || spec === 'default') continue;
        importToSource.set(spec, resolved);
      }
    }

    const patched: CallEdge[] = file.callEdges.map((edge) => {
      if (!edge.unresolved) return edge;
      if (edge.unresolvedHint !== 'cross-file-or-external') return edge;
      if (!edge.calleeIdentity) return edge;

      const name = extractSymbolName(edge.calleeIdentity);
      if (!name) return edge;

      const sourceFile = importToSource.get(name);
      if (!sourceFile) return edge;

      const exportMap = exportedByFile.get(sourceFile);
      const realIdentity = exportMap?.get(name);
      if (!realIdentity) return edge;

      return {
        callerIdentity: edge.callerIdentity,
        callSite: edge.callSite,
        calleeIdentity: realIdentity,
        unresolved: false,
      };
    });

    return { ...file, callEdges: patched };
  });
}

/**
 * Extract the trailing symbol name from a NodeIdentity of shape
 * `<project>:<file>:<symbol>` — symbols may themselves contain dots
 * (e.g., `Class.method`), so we split on `:` and take the last segment.
 */
function extractSymbolName(identity: NodeIdentity): string | null {
  const parts = identity.split(':');
  return parts.length >= 3 ? (parts.at(-1) ?? null) : null;
}

const CANDIDATE_EXTENSIONS: ReadonlyArray<string> = ['.ts', '.tsx', '.js', '.jsx', '.cts', '.mts'];

/**
 * Resolves a module specifier to a parsed-file path inside the project.
 * Returns null for non-relative imports (e.g., 'express') or unresolvable
 * paths (e.g., the import points at a file that wasn't parsed because it
 * was filtered out).
 */
function resolveModulePath(
  fromFilePath: string,
  modulePath: string,
  filesByPath: Map<string, ParseOutput>,
): string | null {
  if (!modulePath.startsWith('.')) return null; // external (node_modules)

  // Compute the relative target as a normalised path.
  // fromFilePath is like 'src/routes/orders.ts' (project-relative).
  // modulePath is like '../services/orderService.ts' or './foo'.
  const fromDir = parentDir(fromFilePath);
  const target = normalisePath(joinPath(fromDir, modulePath));

  // Direct match (with extension).
  if (filesByPath.has(target)) return target;

  // Try with each candidate extension.
  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = `${target}${ext}`;
    if (filesByPath.has(candidate)) return candidate;
  }

  // Try as a directory with index files.
  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = `${target}/index${ext}`;
    if (filesByPath.has(candidate)) return candidate;
  }

  // If the module path ended in `.ts` but the actual file is `.tsx`
  // (or vice versa) — try swapping.
  if (target.endsWith('.ts')) {
    const swapped = `${target.slice(0, -3)}.tsx`;
    if (filesByPath.has(swapped)) return swapped;
  } else if (target.endsWith('.tsx')) {
    const swapped = `${target.slice(0, -4)}.ts`;
    if (filesByPath.has(swapped)) return swapped;
  }

  return null;
}

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function joinPath(a: string, b: string): string {
  if (a === '') return b;
  if (b.startsWith('/')) return b;
  return `${a}/${b}`;
}

function normalisePath(path: string): string {
  const segments: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      segments.pop();
    } else {
      segments.push(seg);
    }
  }
  return segments.join('/');
}
