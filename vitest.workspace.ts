import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  './packages/shared',
  './packages/adapters',
  './packages/analyzer',
  './apps/server',
]);
