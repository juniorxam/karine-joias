import { describe, expect, it } from "vitest";
import { resolveAlternativeOrders } from "./alternativeOrder";

describe("alternative order persistence", () => {
  it("restores the same order from a serialized local/cloud snapshot", () => {
    const questions = [{ id: 1, options: ["A", "B", "C", "D"], correct: 0 }];
    const snapshot = { alternativeOrders: { 1: [3, 1, 0, 2] }, answers: { 1: { selected: 2, correct: true } } };
    const payload = JSON.parse(JSON.stringify(snapshot));
    expect(resolveAlternativeOrders(payload.alternativeOrders, true, questions)).toEqual({ 1: [3, 1, 0, 2] });
  });
});
