import type { RootRouter } from '@cw/server/src/router/index.ts';
import { createTRPCClient, httpBatchLink } from '@trpc/client';

export const trpcClient = createTRPCClient<RootRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
});

export type TrpcClient = typeof trpcClient;
