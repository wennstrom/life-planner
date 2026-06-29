/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as backlog from "../backlog.js";
import type * as crons from "../crons.js";
import type * as google_accounts from "../google/accounts.js";
import type * as google_client from "../google/client.js";
import type * as google_inbound from "../google/inbound.js";
import type * as google_inboundMutations from "../google/inboundMutations.js";
import type * as google_outbound from "../google/outbound.js";
import type * as google_outboundQueries from "../google/outboundQueries.js";
import type * as google_tokens from "../google/tokens.js";
import type * as google_watch from "../google/watch.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_dates from "../lib/dates.js";
import type * as lib_googleTokens from "../lib/googleTokens.js";
import type * as notes from "../notes.js";
import type * as projects from "../projects.js";
import type * as tasks from "../tasks.js";
import type * as timeBlocks from "../timeBlocks.js";
import type * as today from "../today.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  backlog: typeof backlog;
  crons: typeof crons;
  "google/accounts": typeof google_accounts;
  "google/client": typeof google_client;
  "google/inbound": typeof google_inbound;
  "google/inboundMutations": typeof google_inboundMutations;
  "google/outbound": typeof google_outbound;
  "google/outboundQueries": typeof google_outboundQueries;
  "google/tokens": typeof google_tokens;
  "google/watch": typeof google_watch;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/dates": typeof lib_dates;
  "lib/googleTokens": typeof lib_googleTokens;
  notes: typeof notes;
  projects: typeof projects;
  tasks: typeof tasks;
  timeBlocks: typeof timeBlocks;
  today: typeof today;
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

export declare const components: {};
