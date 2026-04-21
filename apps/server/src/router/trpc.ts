import { TRPCError, initTRPC } from '@trpc/server';
import type { OpenedCodebase } from '../codebase/open.ts';
import type { AppContext } from '../context.ts';

export type ScopedContext = AppContext & { readonly codebase: OpenedCodebase };

const t = initTRPC.context<AppContext>().create();

export const router = t.router;
export const baseProcedure = t.procedure;

export const scopedProcedure = t.procedure.use(async (opts) => {
  const active = opts.ctx.session.getActive();
  if (!active) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'no active codebase' });
  }
  return opts.next({ ctx: { ...opts.ctx, codebase: active } });
});

export function scopedError(code: TRPCError['code'], message: string): TRPCError {
  return new TRPCError({ code, message });
}
