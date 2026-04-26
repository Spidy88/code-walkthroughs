import type { LanguageAdapter, ParseOutput } from '@cw/adapters';
import type { EntryPoint } from '@cw/shared';
import { classifyFilesStage1 } from './classify/stage1.ts';
import { classifyFilesStage2 } from './classify/stage2.ts';
import { generateStage3PrepQuestions } from './classify/stage3.ts';
import { detectPaths } from './paths/detect.ts';
import { resolveCrossFileCallEdges } from './paths/resolve-cross-file.ts';
import type { AnalysisInput, AnalysisOutput } from './types.ts';

export async function runAnalysis(
  adapter: LanguageAdapter,
  input: AnalysisInput,
): Promise<AnalysisOutput> {
  const { project, files, llm, signal } = input;

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

  const { paths, pathNodes } = detectPaths({
    entryPoints,
    files: resolvedFiles,
    projectId: project.id,
    ...(signal !== undefined ? { signal } : {}),
  });

  const prepQuestions = generateStage3PrepQuestions({ classifications });

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
  };
}
