import { createFileRoute } from '@tanstack/react-router';
import { DevStylesPage } from '../../features/dev-styles/DevStylesPage.tsx';

export const Route = createFileRoute('/dev/styles')({
  component: DevStylesPage,
});
