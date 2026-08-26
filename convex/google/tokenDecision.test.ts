import { describe, expect, it } from "vitest";
import {
  clerkTokenUsable,
  tokenInfoIndicatesCalendar,
} from "./tokenDecision";

describe("tokenInfoIndicatesCalendar", () => {
  it("returns has_calendar when calendar is in space-separated scopes", () => {
    expect(
      tokenInfoIndicatesCalendar({
        ok: true,
        scope: "openid email https://www.googleapis.com/auth/calendar",
      }),
    ).toBe("has_calendar");
  });

  it("returns missing_calendar when tokeninfo succeeds without calendar", () => {
    expect(
      tokenInfoIndicatesCalendar({
        ok: true,
        scope: "openid email profile",
      }),
    ).toBe("missing_calendar");
  });

  it("treats narrower calendar scopes as missing, matching what the app requests", () => {
    expect(
      tokenInfoIndicatesCalendar({
        ok: true,
        scope: "openid https://www.googleapis.com/auth/calendar.readonly",
      }),
    ).toBe("missing_calendar");
  });

  it("returns unknown when tokeninfo HTTP fails instead of treating it as missing calendar", () => {
    expect(
      tokenInfoIndicatesCalendar({
        ok: false,
        scope: undefined,
      }),
    ).toBe("unknown");
  });
});

describe("clerkTokenUsable", () => {
  it("uses the token when Clerk reports calendar scope", () => {
    expect(
      clerkTokenUsable({
        clerkScopes: ["https://www.googleapis.com/auth/calendar"],
        tokenInfoStatus: "unknown",
      }),
    ).toBe("use");
  });

  it("uses the token when tokeninfo reports calendar scope", () => {
    expect(
      clerkTokenUsable({
        clerkScopes: [],
        tokenInfoStatus: "has_calendar",
      }),
    ).toBe("use");
  });

  it("fails when Clerk reports scopes without calendar", () => {
    expect(
      clerkTokenUsable({
        clerkScopes: ["openid", "email"],
        tokenInfoStatus: "unknown",
      }),
    ).toBe("fail_missing_scope");
  });

  it("fails when Clerk only reports a narrower calendar scope", () => {
    expect(
      clerkTokenUsable({
        clerkScopes: ["https://www.googleapis.com/auth/calendar.events"],
        tokenInfoStatus: "unknown",
      }),
    ).toBe("fail_missing_scope");
  });

  it("fails closed when Clerk has no scopes and tokeninfo is unknown", () => {
    expect(
      clerkTokenUsable({
        clerkScopes: [],
        tokenInfoStatus: "unknown",
      }),
    ).toBe("fail_missing_scope");
  });
});
