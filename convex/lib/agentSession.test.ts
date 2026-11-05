import { describe, expect, it } from "vitest";
import { effectiveSessionId, isValidSessionId } from "./agentSession";

describe("isValidSessionId", () => {
  it("accepts 1–128 characters of the allowed set", () => {
    expect(isValidSessionId("a")).toBe(true);
    expect(isValidSessionId("Claude.run_1:2026-11-05")).toBe(true);
    expect(isValidSessionId("x".repeat(128))).toBe(true);
  });

  it("rejects empty, too long and other characters", () => {
    expect(isValidSessionId("")).toBe(false);
    expect(isValidSessionId("x".repeat(129))).toBe(false);
    expect(isValidSessionId("a b")).toBe(false);
    expect(isValidSessionId("a/b")).toBe(false);
    expect(isValidSessionId("é")).toBe(false);
  });
});

describe("effectiveSessionId", () => {
  it("prefers a valid sessionId argument over the header", () => {
    expect(effectiveSessionId({ sessionId: "arg" }, "header")).toBe("arg");
  });

  it("falls back to the header", () => {
    expect(effectiveSessionId({}, "header")).toBe("header");
    expect(effectiveSessionId({ sessionId: "bad id" }, "header")).toBe(
      "header",
    );
    expect(effectiveSessionId(null, undefined)).toBeUndefined();
  });
});
