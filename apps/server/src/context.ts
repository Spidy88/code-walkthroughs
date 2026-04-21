import type { CodebaseRegistry } from './codebase/registry.ts';
import type { UserDb } from './db/user.ts';
import type { LlmClient } from './llm/client.ts';
import type { Logger } from './logger.ts';
import type { DataPaths } from './paths.ts';
import type { Session } from './session.ts';

export type AppContext = {
  readonly logger: Logger;
  readonly session: Session;
  readonly registry: CodebaseRegistry;
  readonly userDb: UserDb;
  readonly dataPaths: DataPaths;
  readonly llmClient: LlmClient;
  readonly now: () => Date;
};

export function createAppContext(input: AppContext): AppContext {
  return input;
}
