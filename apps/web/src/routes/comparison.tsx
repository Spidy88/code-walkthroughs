import { createFileRoute } from '@tanstack/react-router';
import { ComparisonPage } from '../features/comparison/ComparisonPage.tsx';

export const Route = createFileRoute('/comparison')({
  component: ComparisonPage,
});
