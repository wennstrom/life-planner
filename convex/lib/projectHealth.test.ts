import { describe, expect, it } from "vitest";
import {
  PROJECT_HEALTH,
  isCalendarGoalDate,
  isProjectHealth,
} from "./projectHealth";

describe("isProjectHealth", () => {
  it("accepts the three literals", () => {
    expect(PROJECT_HEALTH).toEqual(["onTrack", "atRisk", "offTrack"]);
    expect(isProjectHealth("onTrack")).toBe(true);
    expect(isProjectHealth("atRisk")).toBe(true);
    expect(isProjectHealth("offTrack")).toBe(true);
  });

  it("rejects other strings", () => {
    expect(isProjectHealth("on hold")).toBe(false);
    expect(isProjectHealth("done")).toBe(false);
    expect(isProjectHealth("")).toBe(false);
  });
});

describe("isCalendarGoalDate", () => {
  it("accepts a real YYYY-MM-DD day", () => {
    expect(isCalendarGoalDate("2026-09-30")).toBe(true);
    expect(isCalendarGoalDate("2024-02-29")).toBe(true);
  });

  it("rejects empty, non-ISO, and impossible days", () => {
    expect(isCalendarGoalDate("")).toBe(false);
    expect(isCalendarGoalDate("09/30/2026")).toBe(false);
    expect(isCalendarGoalDate("2026-13-01")).toBe(false);
    expect(isCalendarGoalDate("2026-02-30")).toBe(false);
    expect(isCalendarGoalDate("2026-9-3")).toBe(false);
  });
});
