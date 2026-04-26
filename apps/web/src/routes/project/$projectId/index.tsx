import { createFileRoute } from '@tanstack/react-router';
import { ProjectOverviewPage } from '../../../features/project/ProjectOverviewPage.tsx';

export const Route = createFileRoute('/project/$projectId/')({
  component: ProjectOverviewPage,
});
