// Rules for projects.agentContext, the "Context for agents" markdown. No Convex
// imports, so the app can share them.

/** Longest `projects.agentContext` we store, in characters. */
export const AGENT_CONTEXT_MAX_LENGTH = 10_000;

/** Trims the context and rejects it if it is too long. "" means clear. */
export function parseAgentContext(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > AGENT_CONTEXT_MAX_LENGTH) {
    throw new Error(
      `Context for agents can be at most ${AGENT_CONTEXT_MAX_LENGTH.toLocaleString("en-US")} characters (got ${trimmed.length.toLocaleString("en-US")})`,
    );
  }
  return trimmed;
}
