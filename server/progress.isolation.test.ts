import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<number, { userId: number; payload: string; updatedAt: Date }>();
const dbMock = vi.hoisted(() => ({
  getStudyProgress: vi.fn(async (userId: number) => store.get(userId) ?? null),
  upsertStudyProgress: vi.fn(async (userId: number, payload: string) => {
    const row = { userId, payload, updatedAt: new Date() };
    store.set(userId, row);
    return row;
  }),
}));

vi.mock("./db", () => dbMock);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function contextFor(id: number): TrpcContext {
  return {
    user: { id, openId: `user-${id}`, name: `User ${id}`, email: `user${id}@example.com`, loginMethod: "manus", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("progress isolation and reload recovery", () => {
  beforeEach(() => { store.clear(); dbMock.getStudyProgress.mockClear(); dbMock.upsertStudyProgress.mockClear(); });

  it("keeps each user's progress isolated", async () => {
    const first = appRouter.createCaller(contextFor(1));
    const second = appRouter.createCaller(contextFor(2));
    await first.progress.save({ payload: JSON.stringify({ current: 4, answers: { 1: { correct: true } } }) });
    await second.progress.save({ payload: JSON.stringify({ current: 12, answers: { 1: { correct: false } } }) });
    expect((await first.progress.get())?.payload).toContain('"current":4');
    expect((await second.progress.get())?.payload).toContain('"current":12');
    expect(dbMock.upsertStudyProgress).toHaveBeenNthCalledWith(1, 1, expect.any(String));
    expect(dbMock.upsertStudyProgress).toHaveBeenNthCalledWith(2, 2, expect.any(String));
  });

  it("returns the saved progress to a new caller simulating a reload", async () => {
    const beforeReload = appRouter.createCaller(contextFor(7));
    await beforeReload.progress.save({ payload: JSON.stringify({ current: 23, started: true }) });
    const afterReload = appRouter.createCaller(contextFor(7));
    expect(await afterReload.progress.get()).toMatchObject({ payload: JSON.stringify({ current: 23, started: true }) });
  });
});
