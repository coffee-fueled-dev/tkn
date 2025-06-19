/**
 * TKN Client Library - Focused clients for different environments
 *
 * Choose the appropriate client for your environment:
 * - TknBrowserClient: For browser/WebSocket environments
 * - TknNodeClient: For Node.js/Bun/server environments
 */

// Protocol utilities and types
export {
  PROTOCOL_HEADER_SIZE,
  TYPE_JSON,
  TYPE_STRING,
  TYPE_BINARY,
  TYPE_BATCH,
  encodeMessage,
} from "./common";

export type { TknMessageType, TknData, TknBatchItem } from "./common";

// Browser client
export { TknBrowserClient } from "./browser";
export type { TknBrowserOptions } from "./browser";

// Node/Bun client
export { TknNodeClient } from "./node";
export type { TknNodeOptions } from "./node";
