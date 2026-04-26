import { createFileRoute } from '@tanstack/react-router';
import { PrepQueuePage } from '../features/prep/PrepQueuePage.tsx';

export const Route = createFileRoute('/prep')({
  component: PrepQueuePage,
});
