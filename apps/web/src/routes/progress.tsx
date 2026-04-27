import { createFileRoute } from '@tanstack/react-router';
import { ProgressPage } from '../features/progress/ProgressPage.tsx';

export const Route = createFileRoute('/progress')({
  component: ProgressPage,
});
