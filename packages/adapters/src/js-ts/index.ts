import type { LanguageAdapter } from '../adapter.ts';
import { jsTsClassifierSignals } from './classifier-signals.ts';
import { expressFrameworkAdapter } from './frameworks/express.ts';
import { parseJsTs } from './parse.ts';

export const jsTsAdapter: LanguageAdapter = {
  language: 'javascript-typescript',
  detect(project) {
    return (
      project.language === 'typescript' ||
      project.language === 'javascript' ||
      project.frameworks.includes('node') ||
      project.frameworks.includes('react')
    );
  },
  parseFile: parseJsTs,
  classifierSignals: jsTsClassifierSignals,
  frameworkAdapters: [expressFrameworkAdapter],
};
