import { describe, expect, it } from "vitest";
import {
  BACKLOG_COLUMN_COLOR,
  BOARD_COLUMN_COLORS,
  DEFAULT_BOARD_COLUMNS,
  isBoardColumnColor,
  normalizeColumnName,
} from "./boardColumnColors";

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

  it("seeds In-Progress, Test, Done with the spec colors", () => {
    expect(DEFAULT_BOARD_COLUMNS).toEqual([
      { name: "In-Progress", color: "#3b82f6", isDone: false },
      { name: "Test", color: "#eab308", isDone: false },
      { name: "Done", color: "#22c55e", isDone: true },
    ]);
  });

  it("uses a slate heading color for the virtual backlog column", () => {
    expect(BACKLOG_COLUMN_COLOR).toBe("#64748b");
    expect(isBoardColumnColor(BACKLOG_COLUMN_COLOR)).toBe(false);
  });

  it("accepts only palette colors", () => {
    expect(isBoardColumnColor("#3b82f6")).toBe(true);
    expect(isBoardColumnColor("#ffffff")).toBe(false);
    expect(isBoardColumnColor("blue")).toBe(false);
  });

  it("trims names and rejects blank", () => {
    expect(normalizeColumnName("  Review  ")).toBe("Review");
    expect(normalizeColumnName("   ")).toBe("");
  });
});
