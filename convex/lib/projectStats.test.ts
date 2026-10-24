import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  focusBucket,
  isInWeek,
  pickNextAction,
  splitMinutes,
} from "./projectStats";

const col = (id: string, isDone = false) => ({
  _id: id as Id<"boardColumns">,
  isDone,
});
const task = (id: string, order: number, columnId?: string) => ({
  _id: id as Id<"tasks">,
  title: id,
  order,
  ...(columnId ? { columnId: columnId as Id<"boardColumns"> } : {}),
});

describe("splitMinutes", () => {
  it("splits evenly", () => {
    expect(splitMinutes(90, 3)).toEqual([30, 30, 30]);
  });

  it("gives leftover minutes to the lowest positions", () => {
    expect(splitMinutes(100, 3)).toEqual([34, 33, 33]);
  });

  it("returns nothing for zero memberships", () => {
    expect(splitMinutes(60, 0)).toEqual([]);
  });
});

describe("isInWeek", () => {
  const window = { weekStartMs: 1000, weekEndMs: 2000, nowMs: 1500 };

  it("includes the start and excludes the end", () => {
    expect(isInWeek(1000, window)).toBe(true);
    expect(isInWeek(1999, window)).toBe(true);
    expect(isInWeek(2000, window)).toBe(false);
    expect(isInWeek(999, window)).toBe(false);
  });
});

describe("focusBucket", () => {
  it("groups interrupted and unset as other", () => {
    expect(focusBucket("deep")).toBe("deep");
    expect(focusBucket("shallow")).toBe("shallow");
    expect(focusBucket("interrupted")).toBe("other");
    expect(focusBucket(undefined)).toBe("other");
  });
});

describe("pickNextAction", () => {
  const columns = [col("todo"), col("doing"), col("test"), col("done", true)];

  it("prefers the non-done column closest to Done", () => {
    const next = pickNextAction(
      [task("a", 0, "todo"), task("b", 5, "test"), task("c", 0, "doing")],
      columns,
    );
    expect(next?._id).toBe("b");
  });

  it("puts unassigned and stale-column tasks last", () => {
    const next = pickNextAction(
      [task("a", 0), task("b", 0, "gone"), task("c", 9, "todo")],
      columns,
    );
    expect(next?._id).toBe("c");
  });

  it("uses order within a column", () => {
    const next = pickNextAction(
      [task("a", 2, "doing"), task("b", 1, "doing")],
      columns,
    );
    expect(next?._id).toBe("b");
  });

  it("returns undefined with no open tasks", () => {
    expect(pickNextAction([], columns)).toBeUndefined();
  });
});
