export type GoogleScopeStatus = "has_calendar" | "missing_calendar" | "unknown";

/** Full read/write Calendar scope; must stay in sync with the frontend request. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

function hasCalendarScope(scopes: Array<string>): boolean {
  return scopes.includes(GOOGLE_CALENDAR_SCOPE);
}

export function tokenInfoIndicatesCalendar(result: {
  ok: boolean;
  scope?: string;
}): GoogleScopeStatus {
  if (!result.ok) {
    return "unknown";
  }
  const scopes = result.scope?.split(/[ ,]+/).filter(Boolean) ?? [];
  return hasCalendarScope(scopes) ? "has_calendar" : "missing_calendar";
}

/** Prefer Clerk-reported scopes; fall back to tokeninfo status. */
export function clerkTokenUsable(input: {
  clerkScopes: Array<string>;
  tokenInfoStatus: GoogleScopeStatus;
}): "use" | "fail_missing_scope" {
  if (hasCalendarScope(input.clerkScopes)) {
    return "use";
  }
  if (input.tokenInfoStatus === "has_calendar") {
    return "use";
  }
  if (
    input.tokenInfoStatus === "missing_calendar" ||
    input.clerkScopes.length > 0
  ) {
    return "fail_missing_scope";
  }
  // unknown tokeninfo and empty clerk scopes → fail closed for calendar sync
  return "fail_missing_scope";
}
