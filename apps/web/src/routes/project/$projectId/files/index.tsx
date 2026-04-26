import { createFileRoute } from '@tanstack/react-router';
import { FileBrowserPage } from '../../../../features/files/FileBrowserPage.tsx';

export const Route = createFileRoute('/project/$projectId/files/')({
  component: FileBrowserPage,
});
