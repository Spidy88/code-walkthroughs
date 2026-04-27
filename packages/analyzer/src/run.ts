import type { LanguageAdapter, ParseOutput } from '@cw/adapters';
import type { EntryPoint } from '@cw/shared';
import { classifyFilesStage1 } from './classify/stage1.ts';
import { classifyFilesStage2 } from './classify/stage2.ts';
import { generateStage3PrepQuestions } from './classify/stage3.ts';
import { detectPaths } from './paths/detect.ts';
import { resolveCrossFileCallEdges } from './paths/resolve-cross-file.ts';
import { detectRenameCandidates } from './renames/detect.ts';
import { evaluateBuiltinRules } from './rules/evaluate.ts';
import type { AnalysisInput, AnalysisOutput } from './types.ts';

export async function runAnalysis(
  adapter: LanguageAdapter,
  input: AnalysisInput,
): Promise<AnalysisOutput> {
  const { project, files, llm, signal, branchAnswers, priorAnalyzedNodes } = input;

  const parsedFiles: ParseOutput[] = [];
  for (const file of files) {
    if (signal?.aborted) signal.throwIfAborted();
    const parsed = adapter.parseFile({
      projectId: project.id,
      filePath: file.filePath,
      content: file.content,
    });
    parsedFiles.push(parsed);
  }

  const applicableFrameworks = adapter.frameworkAdapters.filter((f) =>
    f.detect(project, parsedFiles),
  );

  const architecturalHints = llm?.architecturalPass
    ? await llm.architecturalPass({
        project,
        paths: parsedFiles.map((p) => p.file.path),
        rootPackageJson: null,
      })
    : null;

  const combinedSignals = [
    ...adapter.classifierSignals,
    ...applicableFrameworks.flatMap((f) => f.classifierSignals),
  ];

  const stage1 = classifyFilesStage1({
    project,
    parsedFiles,
    signals: combinedSignals,
  });

  const contentByPath = new Map(files.map((f) => [f.filePath, f.content]));
  const classifications = await classifyFilesStage2({
    parsedFiles,
    stage1,
    hints: architecturalHints,
    llm: llm?.classifyStage2,
    contentSource: { getContent: (path) => contentByPath.get(path) },
    ...(signal !== undefined ? { signal } : {}),
  });

  // Resolve cross-file call edges so paths can traverse handler → service →
  // repository → external client chains rather than terminating at the first
  // non-local call. The resolver only patches edges marked
  // 'cross-file-or-external'; truly external imports are left unresolved.
  const resolvedFiles = resolveCrossFileCallEdges(parsedFiles);

  const entryPoints: EntryPoint[] = applicableFrameworks.flatMap((f) =>
    f.detectEntryPoints({ project, files: resolvedFiles }),
  );

  const detection = detectPaths({
    entryPoints,
    files: resolvedFiles,
    projectId: project.id,
    ...(signal !== undefined ? { signal } : {}),
    ...(branchAnswers !== undefined ? { branchAnswers } : {}),
  });
  const pathNodes = detection.pathNodes;
  const branchQuestions = detection.branchQuestions;
  let paths = detection.paths;

  // LLM path categorisation. Replaces the deterministic basename-
  // grouped categories with reviewer-meaningful ones (auth, billing,
  // order lifecycle…) when the LLM-on path is wired. Off when the
  // callback is absent — the deterministic categories stay.
  if (llm?.categorizePaths && paths.length > 0) {
    const entryByPathId = new Map<string, EntryPoint>();
    for (const p of paths) {
      const entry = entryPoints.find((e) => e.id === p.entryPointId);
      if (entry) entryByPathId.set(p.id, entry);
    }
    const nodesByPathId = new Map<string, string[]>();
    for (const n of pathNodes) {
      const arr = nodesByPathId.get(n.pathId) ?? [];
      arr.push(n.nodeIdentity.split(':').at(-1) ?? '');
      nodesByPathId.set(n.pathId, arr);
    }
    const categorization = await llm.categorizePaths({
      project,
      paths: paths.map((p) => {
        const entry = entryByPathId.get(p.id);
        const fileName = entry?.nodeIdentity.split(':')[1] ?? '';
        return {
          pathId: p.id,
          entryName: entry?.nodeIdentity.split(':').at(-1) ?? '',
          entryFilePath: fileName,
          nodeNames: nodesByPathId.get(p.id) ?? [],
        };
      }),
    });
    if (categorization) {
      const orderByCategory = new Map(categorization.categories.map((c) => [c.name, c.order]));
      const assignmentByPath = new Map(
        categorization.assignments.map((a) => [a.pathId, a.category]),
      );
      paths = paths.map((p) => {
        const category = assignmentByPath.get(p.id) ?? p.category;
        const order: number | null = category
          ? (orderByCategory.get(category) ?? p.categoryOrder ?? null)
          : (p.categoryOrder ?? null);
        return { ...p, category, categoryOrder: order };
      });
    }
  }

  const renameCandidates = priorAnalyzedNodes
    ? detectRenameCandidates({
        priorNodes: priorAnalyzedNodes,
        currentFiles: resolvedFiles,
      })
    : [];

  const prepQuestions = [
    ...generateStage3PrepQuestions({ classifications }),
    ...branchQuestions,
    ...renameCandidates,
  ];

  const ruleResults = evaluateBuiltinRules({ classifications, parsedFiles: resolvedFiles });

  return {
    project,
    // Expose the resolved-edge view so persistence and downstream consumers
    // see cross-file callees as resolved (not 'cross-file-or-external'). The
    // node and import lists are unchanged by resolution; only callEdges differ.
    parsedFiles: resolvedFiles,
    classifications,
    entryPoints,
    paths,
    pathNodes,
    prepQuestions,
    architecturalHints,
    ruleResults,
  };
}
