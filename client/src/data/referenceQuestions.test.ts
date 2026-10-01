import { describe, expect, it } from "vitest";
import { referenceQuestions } from "./referenceQuestions";

describe("reference question bank", () => {
  it("contains the authorized 50-question bank with valid structure", () => {
    expect(referenceQuestions).toHaveLength(50);
    expect(referenceQuestions.map(question => question.id)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
    expect(new Set(referenceQuestions.map(question => question.axis)).size).toBe(4);
    expect(referenceQuestions.every(question => question.options.length === 4 && question.correct >= 0 && question.correct < 4)).toBe(true);
    expect(referenceQuestions.every(question => question.prompt && question.explanation && question.source)).toBe(true);
  });

  it("distributes correct answers across all four alternative positions", () => {
    const counts = referenceQuestions.reduce((acc, question) => {
      acc[question.correct] += 1;
      return acc;
    }, [0, 0, 0, 0]);

    expect(counts).toEqual([13, 13, 12, 12]);
    expect(new Set(referenceQuestions.map(question => question.correct)).size).toBe(4);
  });
});
