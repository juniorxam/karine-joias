import { describe, expect, it } from "vitest";
import { createQuestionOrder, isValidQuestionOrder, resolveQuestionOrder, shuffleQuestionIds } from "./questionOrder";

describe("question order", () => {
  it("creates a permutation containing every question exactly once", () => {
    const order = createQuestionOrder(5, () => 0.4);
    expect(order).toHaveLength(5);
    expect(new Set(order)).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it("can produce a different order for a new session", () => {
    const ascending = [1, 2, 3, 4, 5];
    const shuffled = shuffleQuestionIds(ascending, () => 0);
    expect(shuffled).not.toEqual(ascending);
    expect(shuffled).toEqual([2, 3, 4, 5, 1]);
  });

  it("validates a saved order before restoring it", () => {
    expect(isValidQuestionOrder([3, 1, 2], 3)).toBe(true);
    expect(isValidQuestionOrder([3, 1, 1], 3)).toBe(false);
    expect(isValidQuestionOrder([1, 2], 3)).toBe(false);
  });

  it("restores the saved order when a session already has answers", () => {
    const saved = [4, 2, 1, 3];
    expect(resolveQuestionOrder(saved, true, 4, () => 0)).toEqual(saved);
  });

  it("creates a new order when there are no answers to preserve", () => {
    expect(resolveQuestionOrder([4, 2, 1, 3], false, 4, () => 0)).toEqual([2, 3, 4, 1]);
  });
});
