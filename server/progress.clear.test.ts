import { beforeEach, describe, expect, it, vi } from "vitest";

const { clearStudyProgress } = vi.hoisted(() => ({ clearStudyProgress: vi.fn() }));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, clearStudyProgress };
});

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(user: TrpcContext["user"]): TrpcContext {
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

const user = { id: 91, openId: "clear-test-user", email: "clear@example.com", name: "Clear Test", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };

describe("progress.clear", () => {
  beforeEach(() => clearStudyProgress.mockReset());

  it("deletes only the authenticated user's progress", async () => {
    const caller = appRouter.createCaller(createContext(user));
    const result = await caller.progress.clear();
    expect(result).toEqual({ success: true });
    expect(clearStudyProgress).toHaveBeenCalledTimes(1);
    expect(clearStudyProgress).toHaveBeenCalledWith(user.id);
  });
});
