import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";
import { api } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "backfill time block tasks from legacy fields",
  { hours: 1 },
  api.migrations.backfillTimeBlockTasks,
  {},
);

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

export default crons;
