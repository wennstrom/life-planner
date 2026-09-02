import { describe, expect, it } from "vitest";
import { BOARD_COLUMN_COLORS, isBoardColumnColor } from "./boardColumnColors";

describe("boardColumnColors", () => {
  it("lists the eight palette colors from the spec", () => {
    expect(BOARD_COLUMN_COLORS).toEqual([
      "#6366f1",
      "#3b82f6",
      "#22c55e",
      "#eab308",
      "#f97316",
      "#ec4899",
      "#a855f7",
      "#14b8a6",
    ]);
  });

  it("accepts only palette colors", () => {
    expect(isBoardColumnColor("#3b82f6")).toBe(true);
    expect(isBoardColumnColor("#ffffff")).toBe(false);
    expect(isBoardColumnColor("blue")).toBe(false);
  });
});
