/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agents from "../agents.js";
import type * as browser from "../browser.js";
import type * as cleanup from "../cleanup.js";
import type * as files from "../files.js";
import type * as graph from "../graph.js";
import type * as hiring from "../hiring.js";
import type * as hiringActions from "../hiringActions.js";
import type * as knowledge from "../knowledge.js";
import type * as lib_formatting from "../lib/formatting.js";
import type * as linkedinAnalytics from "../linkedinAnalytics.js";
import type * as linkedinAnalyticsActions from "../linkedinAnalyticsActions.js";
import type * as links from "../links.js";
import type * as memory from "../memory.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as porter from "../porter.js";
import type * as rss from "../rss.js";
import type * as rssActions from "../rssActions.js";
import type * as seed from "../seed.js";
import type * as skillActions from "../skillActions.js";
import type * as skills from "../skills.js";
import type * as system from "../system.js";
import type * as tasks from "../tasks.js";
import type * as x from "../x.js";
import type * as xActions from "../xActions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agents: typeof agents;
  browser: typeof browser;
  cleanup: typeof cleanup;
  files: typeof files;
  graph: typeof graph;
  hiring: typeof hiring;
  hiringActions: typeof hiringActions;
  knowledge: typeof knowledge;
  "lib/formatting": typeof lib_formatting;
  linkedinAnalytics: typeof linkedinAnalytics;
  linkedinAnalyticsActions: typeof linkedinAnalyticsActions;
  links: typeof links;
  memory: typeof memory;
  messages: typeof messages;
  notifications: typeof notifications;
  porter: typeof porter;
  rss: typeof rss;
  rssActions: typeof rssActions;
  seed: typeof seed;
  skillActions: typeof skillActions;
  skills: typeof skills;
  system: typeof system;
  tasks: typeof tasks;
  x: typeof x;
  xActions: typeof xActions;
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
