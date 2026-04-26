import { createFileRoute } from '@tanstack/react-router';
import { AnalysisProgressPage } from '../features/analysis/AnalysisProgressPage.tsx';

export const Route = createFileRoute('/codebase')({
  component: AnalysisProgressPage,
});
