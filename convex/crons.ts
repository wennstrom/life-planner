import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "google calendar incremental sync",
  { minutes: 15 },
  internal.google.inbound.syncAll,
);

crons.interval(
  "google calendar watch renewal",
  { hours: 12 },
  internal.google.watch.renewAll,
);

crons.interval(
  "purge mcp activity",
  { hours: 24 },
  internal.mcp.activity.purgeOld,
);

crons.interval(
  "expire task claims",
  { hours: 1 },
  internal.taskClaims.cleanupExpired,
  {},
);

export default crons;
