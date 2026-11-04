import { DAY, MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

/** Per-token limits for MCP tool calls, keyed by the token's ID. */
export const mcpRateLimiter = new RateLimiter(components.rateLimiter, {
  read: { kind: "token bucket", rate: 300, period: MINUTE },
  write: { kind: "token bucket", rate: 60, period: MINUTE },
  calendar: { kind: "fixed window", rate: 100, period: DAY },
});
