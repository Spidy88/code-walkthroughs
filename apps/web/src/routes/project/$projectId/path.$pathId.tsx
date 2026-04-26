import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { WalkthroughPage } from '../../../features/walkthrough/WalkthroughPage.tsx';

const searchSchema = z.object({
  // path-node positions are 0-indexed in the analyzer output.
  focus: z.coerce.number().int().nonnegative().optional(),
  // dig-into focus history: each entry is a callee nodeIdentity reached
  // by clicking a dig-into edge from the prior focused node. Persisted
  // in the URL so the spatial drill-down survives reload (spec §6.3).
  dig: z.array(z.string().min(1)).optional(),
});

export const Route = createFileRoute('/project/$projectId/path/$pathId')({
  component: WalkthroughPage,
  validateSearch: searchSchema,
});
