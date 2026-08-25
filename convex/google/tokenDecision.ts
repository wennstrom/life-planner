export type GoogleScopeStatus = "has_calendar" | "missing_calendar" | "unknown";

export type GoogleTokenAction = "use" | "refresh" | "fail_missing_scope";

const TOKEN_REFRESH_BUFFER_MS = 60_000;

export function tokenInfoIndicatesCalendar(result: {
  ok: boolean;
  scope?: string;
}): GoogleScopeStatus {
  if (!result.ok) {
    return "unknown";
  }
  const scopes = result.scope?.split(/[ ,]+/).filter(Boolean) ?? [];
  return scopes.some((scope) => scope.includes("calendar"))
    ? "has_calendar"
    : "missing_calendar";
}

export function nextGoogleTokenAction(input: {
  now: number;
  tokenExpiry?: number;
  hasRefreshToken: boolean;
  alreadyRefreshed: boolean;
  scopeStatus: GoogleScopeStatus;
}): GoogleTokenAction {
  const expired =
    input.tokenExpiry === undefined ||
    input.tokenExpiry <= input.now + TOKEN_REFRESH_BUFFER_MS;

  if (!input.alreadyRefreshed && input.hasRefreshToken && expired) {
    return "refresh";
  }

  if (input.scopeStatus === "has_calendar") {
    return "use";
  }

  if (!input.alreadyRefreshed && input.hasRefreshToken) {
    return "refresh";
  }

  if (input.scopeStatus === "missing_calendar") {
    return "fail_missing_scope";
  }

  return "use";
}
