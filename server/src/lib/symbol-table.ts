/**
 * SymbolTable - Handles conversion between arbitrary data and buffer hashes
 * Provides efficient storage and lookup of original data
 */

import type { CryptoHasher } from "bun";
import { LRUCache } from "lru-cache";

export type HashedValue = Uint8Array<ArrayBuffer>;

export class SymbolTable {
  private table = new Map<string, any>();
  private hashSize: number;

  // Caches for different levels of the hashing process
  private valueToHashCache: LRUCache<string, HashedValue>;
  private stringCache: LRUCache<object, string>;
  private hashToKeyCache: LRUCache<HashedValue, string>;

  // Reusable objects for better performance
  private hasher: CryptoHasher;
  private hashPool: HashedValue[] = [];
  private poolIndex = 0;
  private readonly POOL_SIZE = 100;

  constructor(hashSize: number = 32, cacheSize: number = 1000) {
    this.hashSize = hashSize;
    this.hasher = new Bun.CryptoHasher("sha256");

    // Initialize hash pool
    for (let i = 0; i < this.POOL_SIZE; i++) {
      this.hashPool.push(new Uint8Array(hashSize));
    }

    // Initialize caches with proper options
    this.valueToHashCache = new LRUCache<string, HashedValue>({
      max: cacheSize,
    });
    this.stringCache = new LRUCache<object, string>({ max: cacheSize });
    this.hashToKeyCache = new LRUCache<HashedValue, string>({ max: cacheSize });
  }

  /**
   * Get a hash array from the pool or create a new one
   */
  private getHashArray(): HashedValue {
    if (this.poolIndex >= this.POOL_SIZE) {
      this.poolIndex = 0; // Wrap around and reuse
    }
    return this.hashPool[this.poolIndex++];
  }

  /**
   * Efficiently stringify a value with caching for objects
   */
  private fastStringify(value: any): string {
    if (typeof value !== "object" || value === null) {
      return String(value); // Fast path for primitives
    }

    // Check cache for complex objects
    const cached = this.stringCache.get(value);
    if (cached !== undefined) {
      return cached;
    }

    const str = JSON.stringify(value);
    this.stringCache.set(value, str);
    return str;
  }

  /**
   * Convert arbitrary data to a buffer hash
   * Uses object pooling and caching for efficiency
   */
  private hashData(data: any): HashedValue {
    // Fast path for strings to avoid double stringification
    const inputStr = typeof data === "string" ? data : this.fastStringify(data);

    // Check value cache first
    const cachedHash = this.valueToHashCache.get(inputStr);
    if (cachedHash !== undefined) {
      return cachedHash;
    }

    // Reset hasher state
    this.hasher = new Bun.CryptoHasher("sha256");

    // Get a hash array from the pool
    const hashArray = this.getHashArray();

    // Compute the hash
    this.hasher.update(inputStr);
    this.hasher.digest(hashArray);

    // Cache the result (clone the array to ensure integrity)
    const hashClone = new Uint8Array(hashArray);
    this.valueToHashCache.set(inputStr, hashClone);

    return hashClone;
  }

  /**
   * Generate a string key for efficient hash lookup with caching
   */
  private getHashKey(hash: HashedValue): string {
    // Check cache first
    const cachedKey = this.hashToKeyCache.get(hash);
    if (cachedKey !== undefined) {
      return cachedKey;
    }

    // Generate key and cache it
    const key = Buffer.from(hash).toString("base64");
    this.hashToKeyCache.set(hash, key);
    return key;
  }

  /**
   * Get or create a buffer hash for the given value
   */
  getHash(value: any): HashedValue {
    const hash = this.hashData(value);
    const key = this.getHashKey(hash);

    if (!this.table.has(key)) {
      this.table.set(key, value);
    }

    return hash;
  }

  /**
   * Batch process multiple values at once for better efficiency
   * Returns array of hashes in same order as input values
   */
  getHashBatch(values: any[]): HashedValue[] {
    return values.map((value) => this.getHash(value));
  }

  /**
   * Get the original data for a hash
   */
  getData(hash: HashedValue): any {
    const key = this.getHashKey(hash);
    const data = this.table.get(key);

    if (data === undefined) {
      throw new Error(`Hash not found in symbol table`);
    }

    return data;
  }

  /**
   * Convert an array of hashes back to their original data
   */
  getDataArray(hashes: HashedValue[]): any[] {
    return hashes.map((hash) => this.getData(hash));
  }

  /**
   * Get the size of the symbol table
   */
  size(): number {
    return this.table.size;
  }

  /**
   * Get cache statistics
   */
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

  /**
   * Clear all stored symbols and caches
   */
  clear(): void {
    this.table.clear();
    this.valueToHashCache.clear();
    this.stringCache.clear();
    this.hashToKeyCache.clear();
    this.poolIndex = 0;
  }
}
