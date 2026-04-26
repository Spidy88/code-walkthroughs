import { createFileRoute } from '@tanstack/react-router';
import { CodebasePickerPage } from '../features/codebase/CodebasePickerPage.tsx';

export const Route = createFileRoute('/')({
  component: CodebasePickerPage,
});
