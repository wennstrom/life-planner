import { describe, expect, it } from "vitest";
import {
  dateKeyInZone,
  formatLocal,
  isIsoWithOffset,
  parseIsoWithOffset,
  weekdayInZone,
} from "./mcpTime";

describe("parseIsoWithOffset", () => {
  it("accepts Z and ±HH:MM offsets", () => {
    expect(parseIsoWithOffset("2026-11-04T08:00:00Z")).toBe(
      Date.UTC(2026, 10, 4, 8),
    );
    expect(parseIsoWithOffset("2026-11-04T09:00:00+01:00")).toBe(
      Date.UTC(2026, 10, 4, 8),
    );
    expect(parseIsoWithOffset("2026-11-04T03:30-05:00")).toBe(
      Date.UTC(2026, 10, 4, 8, 30),
    );
    expect(parseIsoWithOffset("2026-11-04T08:00:00.250Z")).toBe(
      Date.UTC(2026, 10, 4, 8, 0, 0, 250),
    );
  });

  it("rejects times without an offset", () => {
    for (const value of [
      "2026-11-04T09:00:00",
      "2026-11-04T09:00",
      "2026-11-04",
      "2026-11-04 09:00:00+01:00",
      "2026-11-04T09:00:00+0100",
      "tomorrow at 9",
      "",
    ]) {
      expect(isIsoWithOffset(value)).toBe(false);
      expect(() => parseIsoWithOffset(value, "start")).toThrow(
        /start must be an ISO 8601 time with a UTC offset/,
      );
    }
  });

  it("rejects dates and times that don't exist", () => {
    for (const value of [
      "2026-02-30T09:00:00Z",
      "2026-13-01T09:00:00Z",
      "2026-11-04T24:00:00Z",
      "2026-11-04T09:60:00Z",
      "2026-11-04T09:00:00+19:00",
    ]) {
      expect(isIsoWithOffset(value)).toBe(false);
    }
  });
});

describe("formatLocal", () => {
  it("formats in the user's zone with its offset", () => {
    const ms = Date.UTC(2026, 10, 4, 8, 15, 30);
    expect(formatLocal(ms, "Europe/Stockholm")).toBe(
      "2026-11-04T09:15:30+01:00",
    );
    expect(formatLocal(ms, "UTC")).toBe("2026-11-04T08:15:30+00:00");
    expect(formatLocal(ms, "Asia/Kolkata")).toBe("2026-11-04T13:45:30+05:30");
    expect(formatLocal(ms, "America/St_Johns")).toBe(
      "2026-11-04T04:45:30-03:30",
    );
  });

  it("switches offset at the spring DST change", () => {
    // Europe/Stockholm jumps from 02:00 CET to 03:00 CEST on 2026-03-29.
    expect(formatLocal(Date.UTC(2026, 2, 29, 0, 59, 59), "Europe/Stockholm")).toBe(
      "2026-03-29T01:59:59+01:00",
    );
    expect(formatLocal(Date.UTC(2026, 2, 29, 1, 0, 0), "Europe/Stockholm")).toBe(
      "2026-03-29T03:00:00+02:00",
    );
  });

  it("tells the repeated autumn hour apart by its offset", () => {
    // America/New_York repeats 01:00-02:00 on 2026-11-01.
    expect(formatLocal(Date.UTC(2026, 10, 1, 5, 30), "America/New_York")).toBe(
      "2026-11-01T01:30:00-04:00",
    );
    expect(formatLocal(Date.UTC(2026, 10, 1, 6, 30), "America/New_York")).toBe(
      "2026-11-01T01:30:00-05:00",
    );
  });

  it("round-trips through parseIsoWithOffset", () => {
    const ms = Date.UTC(2026, 10, 1, 6, 30);
    for (const zone of ["America/New_York", "Europe/Stockholm", "Pacific/Auckland"]) {
      expect(parseIsoWithOffset(formatLocal(ms, zone))).toBe(ms);
    }
  });
});

describe("dateKeyInZone", () => {
  it("uses the local date, not the UTC one", () => {
    const ms = Date.UTC(2026, 10, 4, 23, 30);
    expect(dateKeyInZone(ms, "UTC")).toBe("2026-11-04");
    expect(dateKeyInZone(ms, "Europe/Stockholm")).toBe("2026-11-05");
    expect(dateKeyInZone(ms, "America/Los_Angeles")).toBe("2026-11-04");
    expect(weekdayInZone(ms, "Europe/Stockholm")).toBe("Thursday");
  });
});
