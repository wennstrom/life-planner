import { describe, expect, it } from "vitest";
import { normalizeChecklist } from "./checklist";

describe("normalizeChecklist", () => {
  it("trims text, drops blanks, and keeps done state", () => {
    expect(
      normalizeChecklist([
        { id: "1", text: "  Milk  ", done: true },
        { id: "2", text: "   ", done: false },
        { id: "3", text: "Bread", done: false },
      ]),
    ).toEqual([
      { id: "1", text: "Milk", done: true },
      { id: "3", text: "Bread", done: false },
    ]);
  });

  it("rejects duplicate ids", () => {
    expect(() =>
      normalizeChecklist([
        { id: "x", text: "A", done: false },
        { id: "x", text: "B", done: false },
      ]),
    ).toThrow("Checklist item ids must be unique");
  });
});
