/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiTokens from "../apiTokens.js";
import type * as backlog from "../backlog.js";
import type * as boardColumns from "../boardColumns.js";
import type * as crons from "../crons.js";
import type * as google_accounts from "../google/accounts.js";
import type * as google_clerkTokens from "../google/clerkTokens.js";
import type * as google_client from "../google/client.js";
import type * as google_connection from "../google/connection.js";
import type * as google_inbound from "../google/inbound.js";
import type * as google_inboundMutations from "../google/inboundMutations.js";
import type * as google_outbound from "../google/outbound.js";
import type * as google_outboundQueries from "../google/outboundQueries.js";
import type * as google_tokenDecision from "../google/tokenDecision.js";
import type * as google_tokens from "../google/tokens.js";
import type * as google_watch from "../google/watch.js";
import type * as http from "../http.js";
import type * as lib_agentSession from "../lib/agentSession.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_blockOps from "../lib/blockOps.js";
import type * as lib_blockReview from "../lib/blockReview.js";
import type * as lib_boardColumnColors from "../lib/boardColumnColors.js";
import type * as lib_boardColumns from "../lib/boardColumns.js";
import type * as lib_checklist from "../lib/checklist.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_legacyStatus from "../lib/legacyStatus.js";
import type * as lib_mcpAuth from "../lib/mcpAuth.js";
import type * as lib_mcpTime from "../lib/mcpTime.js";
import type * as lib_projectHealth from "../lib/projectHealth.js";
import type * as lib_projectOps from "../lib/projectOps.js";
import type * as lib_projectStats from "../lib/projectStats.js";
import type * as lib_taskOps from "../lib/taskOps.js";
import type * as lib_taskStats from "../lib/taskStats.js";
import type * as lib_timeBlockMemberships from "../lib/timeBlockMemberships.js";
import type * as lib_timeBlockQueries from "../lib/timeBlockQueries.js";
import type * as lib_userSettings from "../lib/userSettings.js";
import type * as mcp_activity from "../mcp/activity.js";
import type * as mcp_handlers from "../mcp/handlers.js";
import type * as mcp_protocol from "../mcp/protocol.js";
import type * as mcp_rateLimits from "../mcp/rateLimits.js";
import type * as mcp_server from "../mcp/server.js";
import type * as mcp_toolDefs from "../mcp/toolDefs.js";
import type * as mcp_tools from "../mcp/tools.js";
import type * as mcpActivity from "../mcpActivity.js";
import type * as migrateClerkUser from "../migrateClerkUser.js";
import type * as migrations from "../migrations.js";
import type * as projects from "../projects.js";
import type * as tasks from "../tasks.js";
import type * as timeBlocks from "../timeBlocks.js";
import type * as today from "../today.js";
import type * as userSettings from "../userSettings.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiTokens: typeof apiTokens;
  backlog: typeof backlog;
  boardColumns: typeof boardColumns;
  crons: typeof crons;
  "google/accounts": typeof google_accounts;
  "google/clerkTokens": typeof google_clerkTokens;
  "google/client": typeof google_client;
  "google/connection": typeof google_connection;
  "google/inbound": typeof google_inbound;
  "google/inboundMutations": typeof google_inboundMutations;
  "google/outbound": typeof google_outbound;
  "google/outboundQueries": typeof google_outboundQueries;
  "google/tokenDecision": typeof google_tokenDecision;
  "google/tokens": typeof google_tokens;
  "google/watch": typeof google_watch;
  http: typeof http;
  "lib/agentSession": typeof lib_agentSession;
  "lib/auth": typeof lib_auth;
  "lib/blockOps": typeof lib_blockOps;
  "lib/blockReview": typeof lib_blockReview;
  "lib/boardColumnColors": typeof lib_boardColumnColors;
  "lib/boardColumns": typeof lib_boardColumns;
  "lib/checklist": typeof lib_checklist;
  "lib/dates": typeof lib_dates;
  "lib/legacyStatus": typeof lib_legacyStatus;
  "lib/mcpAuth": typeof lib_mcpAuth;
  "lib/mcpTime": typeof lib_mcpTime;
  "lib/projectHealth": typeof lib_projectHealth;
  "lib/projectOps": typeof lib_projectOps;
  "lib/projectStats": typeof lib_projectStats;
  "lib/taskOps": typeof lib_taskOps;
  "lib/taskStats": typeof lib_taskStats;
  "lib/timeBlockMemberships": typeof lib_timeBlockMemberships;
  "lib/timeBlockQueries": typeof lib_timeBlockQueries;
  "lib/userSettings": typeof lib_userSettings;
  "mcp/activity": typeof mcp_activity;
  "mcp/handlers": typeof mcp_handlers;
  "mcp/protocol": typeof mcp_protocol;
  "mcp/rateLimits": typeof mcp_rateLimits;
  "mcp/server": typeof mcp_server;
  "mcp/toolDefs": typeof mcp_toolDefs;
  "mcp/tools": typeof mcp_tools;
  mcpActivity: typeof mcpActivity;
  migrateClerkUser: typeof migrateClerkUser;
  migrations: typeof migrations;
  projects: typeof projects;
  tasks: typeof tasks;
  timeBlocks: typeof timeBlocks;
  today: typeof today;
  userSettings: typeof userSettings;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
