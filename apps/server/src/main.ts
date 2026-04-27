import { serve } from '@hono/node-server';
import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createCodebaseRegistry } from './codebase/registry.ts';
import { createAppContext } from './context.ts';
import { openUserDb } from './db/user.ts';
import { loadEnv } from './env.ts';
import { createLlmClient } from './llm/client.ts';
import { createLogger } from './logger.ts';
import { resolveDataPaths } from './paths.ts';
import { rootRouter } from './router/index.ts';
import { createSession } from './session.ts';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.CW_LOG_LEVEL, env.NODE_ENV !== 'production');
  const dataPaths = resolveDataPaths(env.CW_DATA_DIR);

  logger.info({ dataDir: dataPaths.root }, 'server boot');

  const userDb = openUserDb(dataPaths.userDbPath);
  const registry = createCodebaseRegistry(userDb);
  const session = createSession(logger);

  const llmClient = createLlmClient({
    apiKey: env.ANTHROPIC_API_KEY,
    cacheDbProvider: () => session.getActive()?.dbs.cache ?? null,
    logger,
  });

  const ctx = createAppContext({
    logger,
    session,
    registry,
    userDb,
    dataPaths,
    llmClient,
    now: () => new Date(),
  });

  const app = new Hono();
  app.use('/*', cors({ origin: `http://localhost:${env.CW_WEB_PORT}` }));
  app.use(
    '/trpc/*',
    trpcServer({
      router: rootRouter,
      createContext: () => ctx,
    }),
  );
  app.get('/health', (c) => c.json({ ok: true, llmEnabled: llmClient.enabled }));

  serve({ fetch: app.fetch, port: env.CW_SERVER_PORT }, (info) => {
    logger.info({ port: info.port }, 'server listening');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'server shutting down');
    session.clear();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
