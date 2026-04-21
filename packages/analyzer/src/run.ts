import type { LanguageAdapter, ParseOutput } from '@cw/adapters';
import type { EntryPoint } from '@cw/shared';
import { classifyFilesStage1 } from './classify/stage1.ts';
import { classifyFilesStage2 } from './classify/stage2.ts';
import { generateStage3PrepQuestions } from './classify/stage3.ts';
import { detectPaths } from './paths/detect.ts';
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

  const entryPoints: EntryPoint[] = applicableFrameworks.flatMap((f) =>
    f.detectEntryPoints({ project, files: parsedFiles }),
  );

  const { paths, pathNodes } = detectPaths({
    entryPoints,
    files: parsedFiles,
    projectId: project.id,
    ...(signal !== undefined ? { signal } : {}),
  });

  const prepQuestions = generateStage3PrepQuestions({ classifications });

  return {
    project,
    parsedFiles,
    classifications,
    entryPoints,
    paths,
    pathNodes,
    prepQuestions,
    architecturalHints,
  };
}
