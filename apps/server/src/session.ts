import type { OpenedCodebase } from './codebase/open.ts';
import type { Logger } from './logger.ts';

export type Session = {
  getActive(): OpenedCodebase | null;
  requireActive(): OpenedCodebase;
  setActive(codebase: OpenedCodebase): void;
  clear(): void;
  cancelCurrentAnalysis(): void;
  setAnalysisController(controller: AbortController): void;
};

export class NoActiveCodebaseError extends Error {
  readonly code = 'NO_ACTIVE_CODEBASE' as const;
  constructor() {
    super('no active codebase');
    this.name = 'NoActiveCodebaseError';
  }
}

export function createSession(logger: Logger): Session {
  let active: OpenedCodebase | null = null;
  let controller: AbortController | null = null;
  const log = logger.child({ component: 'session' });

  return {
    getActive() {
      return active;
    },
    requireActive() {
      if (!active) throw new NoActiveCodebaseError();
      return active;
    },
    setActive(codebase) {
      if (active && active.hash !== codebase.hash) {
        log.info({ from: active.hash, to: codebase.hash }, 'switching active codebase');
        controller?.abort();
        active.close();
      }
      active = codebase;
    },
    clear() {
      controller?.abort();
      controller = null;
      if (active) {
        active.close();
        active = null;
      }
    },
    cancelCurrentAnalysis() {
      controller?.abort();
      controller = null;
    },
    setAnalysisController(next) {
      controller?.abort();
      controller = next;
    },
  };
}
