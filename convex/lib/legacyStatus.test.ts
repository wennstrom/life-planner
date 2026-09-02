import { describe, expect, it } from "vitest";
import { legacyStatusToDefaultName } from "./legacyStatus";

describe("legacyStatusToDefaultName", () => {
  it("maps in-progress, test, and done", () => {
    expect(legacyStatusToDefaultName("in-progress")).toBe("In-Progress");
    expect(legacyStatusToDefaultName("test")).toBe("Test");
    expect(legacyStatusToDefaultName("done")).toBe("Done");
  });

  it("leaves backlog, investigate, and review unset", () => {
    expect(legacyStatusToDefaultName("backlog")).toBeNull();
    expect(legacyStatusToDefaultName("investigate")).toBeNull();
    expect(legacyStatusToDefaultName("review")).toBeNull();
  });
});
