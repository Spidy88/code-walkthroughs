export type {
  AggregatedClassification,
  CallEdge,
  ClassifierSignal,
  FrameworkAdapter,
  FrameworkEntryPointInput,
  LanguageAdapter,
  ParseInput,
  ParseOutput,
  SignalInput,
  SignalMatchResult,
} from './adapter.ts';

export { makeNodeIdentity, parseNodeIdentity } from './common/node-identity.ts';
export { jsTsAdapter } from './js-ts/index.ts';
export { parseJsTs } from './js-ts/parse.ts';
export { jsTsClassifierSignals } from './js-ts/classifier-signals.ts';
export { expressFrameworkAdapter } from './js-ts/frameworks/express.ts';
