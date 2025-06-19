/**
 * SymbolTable - Handles conversion between arbitrary data and buffer hashes
 * Provides efficient storage and lookup of original data using fast cyrb53 hashing
 */

import { LRUCache } from "lru-cache";
import { type HashedValue, cyrb53, cyrb53FromBytes } from "./cyrb53";

export class SymbolTable {
  private table = new Map<string, any>();
  private hashSize: number;
  private valueToHashCache!: LRUCache<string, HashedValue>;
  private stringCache!: LRUCache<object, string>;
  private hashToKeyCache!: LRUCache<HashedValue, string>;

  constructor(hashSize: number = 64, cacheSize: number = 10000) {
    this.hashSize = hashSize;
    this.initializeCaches(cacheSize);
  }

  private initializeCaches(cacheSize: number): void {
    this.valueToHashCache = new LRUCache<string, HashedValue>({
      max: cacheSize,
    });
    this.stringCache = new LRUCache<object, string>({ max: cacheSize });
    this.hashToKeyCache = new LRUCache<HashedValue, string>({ max: cacheSize });
  }

  private stringifyValue(value: any): string {
    if (typeof value !== "object" || value === null) {
      return String(value);
    }

    const cached = this.stringCache.get(value);
    if (cached !== undefined) {
      return cached;
    }

    const str = JSON.stringify(value);
    this.stringCache.set(value, str);
    return str;
  }

  private computeHash(data: any): HashedValue {
    if (data instanceof Uint8Array) {
      return this.computeBinaryHash(data);
    }

    const inputStr =
      typeof data === "string" ? data : this.stringifyValue(data);

    const cachedHash = this.valueToHashCache.get(inputStr);
    if (cachedHash !== undefined) {
      return cachedHash;
    }

    const hashArray = cyrb53(inputStr, 0, this.hashSize);
    const hashClone = new Uint8Array(hashArray);
    this.valueToHashCache.set(inputStr, hashClone);

    return hashClone;
  }

  private computeBinaryHash(data: Uint8Array): HashedValue {
    // Use a binary-specific cache key to avoid string conversion
    const cacheKey = `bin:${data.length}:${data[0] || 0}:${
      data[data.length - 1] || 0
    }`;

    const cachedHash = this.valueToHashCache.get(cacheKey);
    if (cachedHash !== undefined) {
      return cachedHash;
    }

    // Hash bytes directly without string conversion (major optimization)
    const hashArray = cyrb53FromBytes(data, 0, this.hashSize);
    const hashClone = new Uint8Array(hashArray);
    this.valueToHashCache.set(cacheKey, hashClone);

    return hashClone;
  }

  private createStorageKey(hash: HashedValue): string {
    const cachedKey = this.hashToKeyCache.get(hash);
    if (cachedKey !== undefined) {
      return cachedKey;
    }

    const key = Buffer.from(hash).toString("base64");
    this.hashToKeyCache.set(hash, key);
    return key;
  }

  private storeValue(key: string, value: any): void {
    if (!this.table.has(key)) {
      this.table.set(key, value);
    }
  }

  getHash(value: any): HashedValue {
    const hash = this.computeHash(value);
    const key = this.createStorageKey(hash);
    this.storeValue(key, value);
    return hash;
  }

  getHashBatch(values: any[]): HashedValue[] {
    return values.map((value) => this.getHash(value));
  }

  getData(hash: HashedValue): any {
    const key = this.createStorageKey(hash);
    const data = this.table.get(key);

    if (data === undefined) {
      throw new Error(`Hash not found in symbol table`);
    }

    return data;
  }

  getDataArray(hashes: HashedValue[]): any[] {
    return hashes.map((hash) => this.getData(hash));
  }

  size(): number {
    return this.table.size;
  }

  getCacheStats(): {
    valueCache: number;
    stringCache: number;
    keyCache: number;
  } {
    return {
      valueCache: this.valueToHashCache.size,
      stringCache: this.stringCache.size,
      keyCache: this.hashToKeyCache.size,
    };
  }

  clear(): void {
    this.table.clear();
    this.valueToHashCache.clear();
    this.stringCache.clear();
    this.hashToKeyCache.clear();
  }
}
