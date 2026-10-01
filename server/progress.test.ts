import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("progress procedures", () => {
  it("rejects cloud progress access without an authenticated user", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.progress.get()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects cloud progress clearing without an authenticated user", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.progress.clear()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an empty progress payload before reaching persistence", async () => {
    const user = {
      id: 42,
      openId: "progress-test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    const caller = appRouter.createCaller(createContext(user));
    await expect(caller.progress.save({ payload: "" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
