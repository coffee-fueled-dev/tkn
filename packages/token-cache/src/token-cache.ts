import { LRUCache } from "lru-cache";
import type { DatabaseToken } from "./domain";
import type { ITokenCache } from "./domain";

export class TokenCache implements ITokenCache {
  private _cache: LRUCache<number, DatabaseToken>;
  private _keyMap: Map<string, number>; // maps byte sequences to their _cache hash keys

  constructor(maxSize: number) {
    this._cache = new LRUCache<number, DatabaseToken>({ max: maxSize });
    // TODO: Prove this will always be in sync with _cache
    this._keyMap = new Map<string, number>();
  }

  // Get the strength (number of observations) of a token by its hash key
  get(key: number | undefined): DatabaseToken | undefined {
    if (!key) return undefined;
    return this._cache.get(key);
  }

  // Sets a new token value, or replaces an existing one
  set(key: number, token: DatabaseToken): void {
    this._keyMap.set(token.bytes, key);
    this._cache.set(key, token);
  }

  get size(): number {
    return this._cache.size;
  }

  values(): Generator<DatabaseToken, void, unknown> {
    return this._cache.values();
  }

  clear(): void {
    this._cache.clear();
    this._keyMap.clear();
  }

  lookup(
    byteString: string,
  ): { key: number; token?: DatabaseToken } | undefined {
    const key = this._keyMap.get(byteString);
    if (!key) return undefined;
    return { key, token: this._cache.get(key) };
  }

  patch(byteString: string, token: DatabaseToken): boolean {
    const existing = this.lookup(byteString);
    if (existing) {
      this._cache.set(existing.key, { ...existing.token, ...token });
      return true;
    } else {
      return false;
    }
  }
}
