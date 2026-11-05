// Agent sessions: a string an agent picks per run, sent as the
// `X-Agent-Session` HTTP header or (for tools that take it) a `sessionId`
// argument. The argument wins over the header.

export const AGENT_SESSION_HEADER = "X-Agent-Session";
export const MAX_SESSION_ID_LENGTH = 128;
export const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
export const INVALID_SESSION_ID_ERROR = `Session IDs are 1–${MAX_SESSION_ID_LENGTH} characters of A–Z, a–z, 0–9, '.', '_', ':' and '-'`;

export function isValidSessionId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_SESSION_ID_LENGTH &&
    SESSION_ID_PATTERN.test(value)
  );
}

/**
 * The session for a tool call: a valid `sessionId` in the tool arguments,
 * else the header's. Invalid argument values are ignored here; the tool's
 * input schema rejects them.
 */
export function effectiveSessionId(
  input: unknown,
  headerSessionId: string | undefined,
): string | undefined {
  if (typeof input === "object" && input !== null) {
    const fromArgs = (input as { sessionId?: unknown }).sessionId;
    if (typeof fromArgs === "string" && isValidSessionId(fromArgs)) {
      return fromArgs;
    }
  }
  return headerSessionId;
}
