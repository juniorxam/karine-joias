import { describe, expect, it } from "vitest";
import { shouldPreferLocalProgress } from "./progressSync";

describe("progress sync precedence", () => {
  it("prefers the local device when it has answers and a newer change timestamp", () => {
    expect(shouldPreferLocalProgress(2000, 1000, true)).toBe(true);
  });

  it("keeps the remote version when it is newer or local has no answers", () => {
    expect(shouldPreferLocalProgress(1000, 2000, true)).toBe(false);
    expect(shouldPreferLocalProgress(3000, 2000, false)).toBe(false);
  });
});
