import type { AnalysisOutput } from '@cw/analyzer';
import type { CacheDb } from '../db/codebase.ts';
import {
  analyzedNodes,
  classifications,
  entryPoints,
  files,
  pathNodes,
  paths,
  prepQuestions,
} from '../db/schema/cache/index.ts';
import type { CollectedFile } from './filesystem.ts';

export async function persistAnalysis(
  db: CacheDb,
  projectId: string,
  output: AnalysisOutput,
  collected: readonly CollectedFile[],
  now: Date,
): Promise<void> {
  const timestamp = now.toISOString();
  const analyzedAt = timestamp;

  await db.delete(files);
  await db.delete(analyzedNodes);
  await db.delete(classifications);
  await db.delete(entryPoints);
  await db.delete(pathNodes);
  await db.delete(paths);
  await db.delete(prepQuestions);

  const contentHashByPath = new Map(
    output.parsedFiles.map((p) => [p.file.path, p.file.contentHash]),
  );
  const languageByPath = new Map(output.parsedFiles.map((p) => [p.file.path, p.file.language]));

  if (collected.length > 0) {
    await db.insert(files).values(
      collected.map((f) => ({
        path: f.filePath,
        projectId,
        contentHash: contentHashByPath.get(f.filePath) ?? '',
        language: languageByPath.get(f.filePath) ?? 'unknown',
        size: f.size,
        analyzedAt,
      })),
    );
  }

  // Persist analyzed nodes (used by walkthrough.getNode + walkthrough.getPath
  // to render code snippets without re-parsing).
  const allNodes = output.parsedFiles.flatMap((p) => p.nodes);
  if (allNodes.length > 0) {
    await db.insert(analyzedNodes).values(
      allNodes.map((n) => ({
        nodeIdentity: n.identity,
        projectId: n.projectId,
        filePath: n.filePath,
        kind: n.kind,
        name: n.name,
        startLine: n.startLine,
        endLine: n.endLine,
        exported: n.exported,
        contentHash: n.contentHash,
        updatedAt: timestamp,
      })),
    );
  }

  if (output.classifications.length > 0) {
    await db.insert(classifications).values(
      output.classifications.map((c) => ({
        nodeIdentity: c.nodeIdentity,
        filePath: c.filePath,
        classification: c.classification,
        confidence: c.confidence,
        source: c.source,
        contentHash: c.contentHash,
        justification: c.justification,
        contributingSignals: c.contributingSignals as unknown,
        conflicting: c.conflicting ? 'true' : 'false',
        updatedAt: timestamp,
      })),
    );
  }

  if (output.entryPoints.length > 0) {
    await db.insert(entryPoints).values(
      output.entryPoints.map((e) => ({
        id: e.id,
        projectId,
        kind: e.kind,
        framework: e.framework,
        nodeIdentity: e.nodeIdentity,
        metadata: e.metadata as unknown,
        updatedAt: timestamp,
      })),
    );
  }

  if (output.paths.length > 0) {
    await db.insert(paths).values(
      output.paths.map((p) => ({
        id: p.id,
        entryPointId: p.entryPointId,
        projectId,
        nodeCount: p.nodeCount,
        maxDepth: p.maxDepth,
        category: p.category ?? null,
        categoryOrder: p.categoryOrder ?? null,
        updatedAt: timestamp,
      })),
    );
  }

  if (output.pathNodes.length > 0) {
    await db.insert(pathNodes).values(
      output.pathNodes.map((n) => ({
        pathId: n.pathId,
        position: n.position,
        nodeIdentity: n.nodeIdentity,
        forkGroup: n.forkGroup ?? null,
        changeKind: n.changeKind ?? null,
        cycleBackToPosition: n.cycleBackToPosition ?? null,
      })),
    );
  }

  if (output.prepQuestions.length > 0) {
    await db.insert(prepQuestions).values(
      output.prepQuestions.map((q) => ({
        key: q.key,
        kind: q.kind,
        context: q.context as unknown,
        suggestion: (q.suggestion ?? null) as unknown,
        alternatives: q.alternatives as unknown,
        createdAt: timestamp,
      })),
    );
  }
}
