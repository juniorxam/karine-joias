import { describe, expect, it } from "vitest";
import { resolveQuestionOrder } from "./questionOrder";

describe("progress question order flow", () => {
  it("keeps the same order after restoring a saved answered snapshot", () => {
    const savedSnapshot = {
      questionOrder: [7, 2, 9, 1, 6, 3, 8, 4, 10, 5],
      answers: { 7: { selected: 0, correct: true } },
    };
    const firstSessionOrder = resolveQuestionOrder(savedSnapshot.questionOrder, Object.keys(savedSnapshot.answers).length > 0, 10, () => 0);
    const restoredOrder = resolveQuestionOrder(firstSessionOrder, Object.keys(savedSnapshot.answers).length > 0, 10, () => 0.99);
    expect(restoredOrder).toEqual(firstSessionOrder);
  });
});
