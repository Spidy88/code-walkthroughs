import { analysisRouter } from './analysis.ts';
import { appRouter } from './app.ts';
import { codebaseRouter } from './codebase.ts';
import { reviewRouter } from './review.ts';
import { router } from './trpc.ts';
import { walkthroughRouter } from './walkthrough.ts';

export const rootRouter = router({
  app: appRouter,
  codebase: codebaseRouter,
  analysis: analysisRouter,
  review: reviewRouter,
  walkthrough: walkthroughRouter,
});

export type RootRouter = typeof rootRouter;
