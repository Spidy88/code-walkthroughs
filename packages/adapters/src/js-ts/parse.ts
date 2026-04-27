import type { AnalyzedFile, AnalyzedNode, FunctionSignature, NodeIdentity } from '@cw/shared';
import { sha256 } from '@cw/shared';
import {
  type ArrowFunction,
  type FunctionExpression,
  Node,
  Project,
  type SourceFile,
  SyntaxKind,
} from 'ts-morph';
import type { CallEdge, ParseInput, ParseOutput } from '../adapter.ts';
import { makeNodeIdentity } from '../common/node-identity.ts';

type SymbolEntry = {
  readonly identity: NodeIdentity;
  readonly name: string;
  readonly kind: AnalyzedNode['kind'];
  readonly startLine: number;
  readonly endLine: number;
  readonly exported: boolean;
  readonly contentHash: string;
  readonly startPos: number;
  readonly endPos: number;
  readonly signature?: FunctionSignature;
};

export function parseJsTs(input: ParseInput): ParseOutput {
  const { projectId, filePath, content } = input;

  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: detectJsx(filePath) ? { allowJs: true, jsx: 4 } : { allowJs: true },
  });
  const source = project.createSourceFile(filePath, content, { overwrite: true });

  const symbols = collectSymbols(source, projectId, filePath, content);
  const imports = collectImports(source);
  const exports = collectExports(source, symbols);
  const callEdges = collectCallEdges(source, symbols, projectId, filePath);

  const file: AnalyzedFile = {
    projectId,
    path: filePath,
    contentHash: sha256(content),
    language: detectLanguage(filePath),
    size: content.length,
    analyzedAt: new Date().toISOString(),
  };

  const nodes: AnalyzedNode[] = symbols.map((s) => ({
    identity: s.identity,
    filePath,
    projectId,
    kind: s.kind,
    name: s.name,
    startLine: s.startLine,
    endLine: s.endLine,
    exported: s.exported,
    contentHash: s.contentHash,
    ...(s.signature !== undefined ? { signature: s.signature } : {}),
  }));

  return {
    file,
    nodes,
    imports,
    exports,
    callEdges,
  };
}

function detectLanguage(filePath: string): string {
  if (filePath.endsWith('.tsx')) return 'tsx';
  if (filePath.endsWith('.ts')) return 'typescript';
  if (filePath.endsWith('.jsx')) return 'jsx';
  return 'javascript';
}

function detectJsx(filePath: string): boolean {
  return filePath.endsWith('.tsx') || filePath.endsWith('.jsx');
}

function collectSymbols(
  source: SourceFile,
  projectId: string,
  filePath: string,
  content: string,
): SymbolEntry[] {
  const entries: SymbolEntry[] = [];

  for (const fn of source.getFunctions()) {
    const name = fn.getName() ?? '<anonymous>';
    entries.push(makeSymbol(projectId, filePath, content, name, 'function', fn, fn.isExported()));
  }

  for (const variable of source.getVariableDeclarations()) {
    const init = variable.getInitializer();
    if (!init) continue;
    if (
      Node.isArrowFunction(init) ||
      Node.isFunctionExpression(init) ||
      Node.isCallExpression(init)
    ) {
      const name = variable.getName();
      const kind: AnalyzedNode['kind'] = isLikelyComponent(name, init) ? 'component' : 'function';
      const statement = variable.getVariableStatement();
      const exported = statement?.isExported() ?? false;
      entries.push(makeSymbol(projectId, filePath, content, name, kind, variable, exported));
    }
  }

  for (const cls of source.getClasses()) {
    const className = cls.getName();
    if (!className) continue;
    for (const method of cls.getMethods()) {
      const symbolPath = `${className}.${method.getName()}`;
      entries.push(makeSymbol(projectId, filePath, content, symbolPath, 'function', method, false));
    }
  }

  // Named function expressions and arrow functions passed as arguments are symbols too,
  // since route/handler style frameworks attach behavior via arguments.
  source.forEachDescendant((node) => {
    if (Node.isFunctionExpression(node)) {
      const name = node.getName();
      if (!name) return;
      if (entries.some((e) => e.startPos === node.getStart())) return;
      entries.push(makeSymbol(projectId, filePath, content, name, 'function', node, false));
      return;
    }
  });

  return entries;
}

function makeSymbol(
  projectId: string,
  filePath: string,
  content: string,
  symbolPath: string,
  kind: AnalyzedNode['kind'],
  node: Node,
  exported: boolean,
): SymbolEntry {
  const startPos = node.getStart();
  const endPos = node.getEnd();
  const startLine = node.getStartLineNumber();
  const endLine = node.getEndLineNumber();
  const slice = content.slice(startPos, endPos);
  const contentHash = sha256(normalizeNodeText(slice));
  const signature = extractSignature(node);
  return {
    identity: makeNodeIdentity(projectId, filePath, symbolPath),
    name: symbolPath.split('.').at(-1) ?? symbolPath,
    kind,
    startLine,
    endLine,
    exported,
    contentHash,
    startPos,
    endPos,
    ...(signature !== undefined ? { signature } : {}),
  };
}

/**
 * Pull params + return type from any callable AST node. The
 * comparison delta uses these strings for param_type_changed /
 * return_type_changed contract changes — exact-match diff over the
 * declared types is the v1 heuristic. False positives on whitespace
 * or formatting changes are intentional: they catch refactors a
 * line-based diff would miss.
 */
function extractSignature(node: Node): FunctionSignature | undefined {
  // VariableDeclaration: pull the initializer (arrow / function-expr).
  let target: Node = node;
  if (Node.isVariableDeclaration(node)) {
    const init = node.getInitializer();
    if (!init) return undefined;
    target = init;
  }
  if (
    !Node.isFunctionDeclaration(target) &&
    !Node.isMethodDeclaration(target) &&
    !Node.isArrowFunction(target) &&
    !Node.isFunctionExpression(target)
  ) {
    return undefined;
  }
  const fn = target as {
    getParameters(): Array<{ getText(): string }>;
    getReturnTypeNode?(): Node | undefined;
  };
  const params = fn.getParameters().map((p) => p.getText());
  // Prefer the explicit return-type annotation when one is written.
  // Inferring via the type checker works but requires Project setup
  // costs we already absorb — keep this fast, type-checker fallback
  // is a future refinement.
  const returnTypeNode = fn.getReturnTypeNode?.();
  const returnType = returnTypeNode ? returnTypeNode.getText() : '';
  return { params, returnType };
}

function normalizeNodeText(text: string): string {
  return text
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyComponent(name: string, init: Node): boolean {
  if (!/^[A-Z]/.test(name)) return false;
  const text = init.getText();
  return text.includes('</') || text.includes('/>') || text.includes('React.createElement');
}

function collectImports(source: SourceFile): ParseOutput['imports'] {
  return source.getImportDeclarations().map((decl) => ({
    from: decl.getModuleSpecifierValue(),
    specifiers: [
      ...decl.getNamedImports().map((s) => s.getName()),
      ...(decl.getDefaultImport() ? ['default'] : []),
      ...(decl.getNamespaceImport() ? ['*'] : []),
    ],
  }));
}

function collectExports(source: SourceFile, symbols: SymbolEntry[]): ParseOutput['exports'] {
  const byName = new Map<string, NodeIdentity>();
  for (const s of symbols) {
    byName.set(s.name, s.identity);
  }

  const results: { name: string; nodeIdentity: NodeIdentity | null }[] = [];
  for (const decl of source.getExportedDeclarations()) {
    const [exportName] = decl;
    results.push({
      name: exportName,
      nodeIdentity: byName.get(exportName) ?? null,
    });
  }
  return results;
}

function collectCallEdges(
  source: SourceFile,
  symbols: SymbolEntry[],
  projectId: string,
  filePath: string,
): CallEdge[] {
  const edges: CallEdge[] = [];
  const localByName = new Map<string, NodeIdentity>();
  for (const s of symbols) {
    localByName.set(s.name, s.identity);
  }

  // Sort symbols by range size ascending so the innermost match wins.
  const symbolsByInnermost = [...symbols].sort(
    (a, b) => a.endPos - a.startPos - (b.endPos - b.startPos),
  );

  for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const start = call.getStart();
    const containing = symbolsByInnermost.find(
      (sym) => start >= sym.startPos && start < sym.endPos,
    );

    const expr = call.getExpression();
    const name = extractCalleeName(expr);
    const { line, column } = source.getLineAndColumnAtPos(start);
    const callSite = { line, column };

    if (containing) {
      const callerIdentity = containing.identity;
      if (!name) {
        edges.push({
          callerIdentity,
          callSite,
          calleeIdentity: null,
          unresolved: true,
          unresolvedHint: 'indirect',
        });
      } else {
        const local = localByName.get(name);
        if (local && local !== callerIdentity) {
          edges.push({
            callerIdentity,
            callSite,
            calleeIdentity: local,
            unresolved: false,
          });
        } else {
          edges.push({
            callerIdentity,
            callSite,
            calleeIdentity: makeNodeIdentity(projectId, filePath, name),
            unresolved: true,
            unresolvedHint: 'cross-file-or-external',
          });
        }
      }
    }

    // Framework-style handler attachment: for x.method(path, handler), emit an
    // edge from the handler to the method so routers/frameworks can be
    // discovered even when the x.method(...) call is at module scope.
    if (name) {
      const handlerArg = call.getArguments().find((arg) => isFunctionLike(arg));
      if (handlerArg && Node.isFunctionExpression(handlerArg)) {
        const handlerName = handlerArg.getName();
        if (handlerName) {
          edges.push({
            callerIdentity: makeNodeIdentity(projectId, filePath, handlerName),
            callSite,
            calleeIdentity: makeNodeIdentity(projectId, filePath, name),
            unresolved: true,
            unresolvedHint: 'handler-attached',
          });
        }
      }
    }
  }

  return edges;
}

function isFunctionLike(node: Node): node is FunctionExpression | ArrowFunction {
  return Node.isFunctionExpression(node) || Node.isArrowFunction(node);
}

function extractCalleeName(expr: Node): string | null {
  if (Node.isIdentifier(expr)) {
    return expr.getText();
  }
  if (Node.isPropertyAccessExpression(expr)) {
    return expr.getName();
  }
  return null;
}
