import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  // Layout chrome (e.g., a global status bar) lands here in a later chunk.
  return <Outlet />;
}
