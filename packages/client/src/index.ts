/**
 * TKN Client Library - Unified client for TKN protocol
 * Works in both browser and Node.js/Bun environments
 */

// Re-export common types and utility functions
export {
  PROTOCOL_HEADER_SIZE,
  TYPE_JSON,
  TYPE_STRING,
  TYPE_BINARY,
  TYPE_BATCH,
  encodeMessage,
} from "./common";

export type {
  TknMessageType,
  TknData,
  TknClientOptionsBase,
  TknBatchItem,
} from "./common";

// Re-export client implementation and types
export {
  isBrowser,
  isNode,
  isBun,
  TknClientBase,
  TknBrowserClient,
  TknNodeClient,
  createTknClient,
  TknClient, // Default client based on environment
} from "./client";

export type {
  TknBrowserOptions,
  TknNodeOptions,
  TknClientOptions,
} from "./client";
