import { createFileRoute } from '@tanstack/react-router';
import { RulesPage } from '../features/rules/RulesPage.tsx';

export const Route = createFileRoute('/rules')({
  component: RulesPage,
});
