import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { clearStudyProgress, getStudyProgress, upsertStudyProgress } from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  progress: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const row = await getStudyProgress(ctx.user.id);
      return row ? { payload: row.payload, updatedAt: row.updatedAt } : null;
    }),
    save: protectedProcedure
      .input(z.object({ payload: z.string().min(2).max(1_000_000) }))
      .mutation(async ({ ctx, input }) => {
        const row = await upsertStudyProgress(ctx.user.id, input.payload);
        return row ? { payload: row.payload, updatedAt: row.updatedAt } : null;
      }),
    clear: protectedProcedure.mutation(async ({ ctx }) => {
      await clearStudyProgress(ctx.user.id);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
