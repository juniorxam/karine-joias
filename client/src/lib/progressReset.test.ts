import { describe, expect, it } from "vitest";
import { createFreshProgressState } from "./progressReset";

describe("fresh progress reset", () => {
  it("clears session state and creates a new question order", () => {
    const state = createFreshProgressState(5, 1234, () => 0);
    expect(state.answers).toEqual({});
    expect(state.current).toBe(0);
    expect(state.started).toBe(false);
    expect(state.showFeedback).toBe(false);
    expect(state.selected).toBeNull();
    expect(state.view).toBe("dashboard");
    expect(state.startTime).toBe(1234);
    expect(state.elapsed).toBe(0);
    expect(state.localChangedAt).toBe(1234);
    expect(state.questionOrder).toEqual([2, 3, 4, 5, 1]);
  });
});
