import { analysisRouter } from './analysis.ts';
import { appRouter } from './app.ts';
import { codebaseRouter } from './codebase.ts';
import { comparisonRouter } from './comparison.ts';
import { prepRouter } from './prep.ts';
import { progressRouter } from './progress.ts';
import { reviewRouter } from './review.ts';
import { ruleRouter } from './rule.ts';
import { router } from './trpc.ts';
import { walkthroughRouter } from './walkthrough.ts';

export const rootRouter = router({
  app: appRouter,
  codebase: codebaseRouter,
  analysis: analysisRouter,
  comparison: comparisonRouter,
  prep: prepRouter,
  progress: progressRouter,
  review: reviewRouter,
  rule: ruleRouter,
  walkthrough: walkthroughRouter,
});

export type RootRouter = typeof rootRouter;
