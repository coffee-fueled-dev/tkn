import type { CachedToken, ILZSCache } from "@tkn/lzs";

export type DatabaseToken = CachedToken & {
  index?: number;
  degree?: number;
};

export interface ITokenCache extends ILZSCache {
  // Lookup a DatabaseToken by its byte sequence, and return its hash and data
  // This allows using a rolling hash for the main cache key
  lookup(bytes: string): { key: number; token?: DatabaseToken } | undefined;

  // Patch an existing token by merging in new data, if it exists
  patch(bytes: string, token: DatabaseToken): boolean;
}
