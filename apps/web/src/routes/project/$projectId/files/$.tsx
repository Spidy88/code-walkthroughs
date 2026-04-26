import { createFileRoute } from '@tanstack/react-router';
import { FileDetailPage } from '../../../../features/files/FileDetailPage.tsx';

export const Route = createFileRoute('/project/$projectId/files/$')({
  component: FileDetailPage,
});
