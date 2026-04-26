import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { WalkthroughPage } from '../../../features/walkthrough/WalkthroughPage.tsx';

const searchSchema = z.object({
  // path-node positions are 0-indexed in the analyzer output.
  focus: z.coerce.number().int().nonnegative().optional(),
});

export const Route = createFileRoute('/project/$projectId/path/$pathId')({
  component: WalkthroughPage,
  validateSearch: searchSchema,
});
