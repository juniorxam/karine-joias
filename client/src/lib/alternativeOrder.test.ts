import { describe, expect, it } from "vitest";
import { applyAlternativeOrder, createAlternativeOrders, resolveAlternativeOrders } from "./alternativeOrder";

describe("alternative order", () => {
  const question = { id: 1, options: ["A", "B", "C", "D"], correct: 0, analysis: ["a", "b", "c", "d"] };

  it("changes positions while preserving the conceptual correct answer and analysis", () => {
    const shuffled = applyAlternativeOrder(question, [2, 0, 3, 1]);
    expect(shuffled.options).toEqual(["C", "A", "D", "B"]);
    expect(shuffled.correct).toBe(1);
    expect(shuffled.analysis).toEqual(["c", "a", "d", "b"]);
  });

  it("creates valid orders for every question", () => {
    const orders = createAlternativeOrders([question], () => 0);
    expect(orders[1]).toEqual([1, 2, 3, 0]);
  });

  it("restores saved orders when a session already has answers", () => {
    const saved = { 1: [2, 0, 3, 1] };
    expect(resolveAlternativeOrders(saved, true, [question])).toEqual(saved);
  });
});
