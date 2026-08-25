import { describe, expect, it } from "vitest";
import {
  nextGoogleTokenAction,
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

  it("returns unknown when tokeninfo HTTP fails instead of treating it as missing calendar", () => {
    expect(
      tokenInfoIndicatesCalendar({
        ok: false,
        scope: undefined,
      }),
    ).toBe("unknown");
  });
});

describe("nextGoogleTokenAction", () => {
  const now = 1_000_000;
  const unexpired = now + 10 * 60_000;

  it("uses the current token when it still has calendar scope", () => {
    expect(
      nextGoogleTokenAction({
        now,
        tokenExpiry: unexpired,
        hasRefreshToken: true,
        alreadyRefreshed: false,
        scopeStatus: "has_calendar",
      }),
    ).toBe("use");
  });

  it("refreshes when the stored token is still unexpired but scope check is unknown", () => {
    expect(
      nextGoogleTokenAction({
        now,
        tokenExpiry: unexpired,
        hasRefreshToken: true,
        alreadyRefreshed: false,
        scopeStatus: "unknown",
      }),
    ).toBe("refresh");
  });

  it("refreshes when the stored access token is missing calendar but a refresh token exists", () => {
    expect(
      nextGoogleTokenAction({
        now,
        tokenExpiry: unexpired,
        hasRefreshToken: true,
        alreadyRefreshed: false,
        scopeStatus: "missing_calendar",
      }),
    ).toBe("refresh");
  });

  it("fails after refresh if calendar is still missing", () => {
    expect(
      nextGoogleTokenAction({
        now,
        tokenExpiry: unexpired,
        hasRefreshToken: true,
        alreadyRefreshed: true,
        scopeStatus: "missing_calendar",
      }),
    ).toBe("fail_missing_scope");
  });
});
