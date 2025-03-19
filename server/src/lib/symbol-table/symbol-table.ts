/**
 * SymbolTable - Handles conversion between arbitrary data and buffer hashes
 * Provides efficient storage and lookup of original data
 */

import type { CryptoHasher } from "bun";
import { LRUCache } from "lru-cache";
import {
  HashAlgorithm,
  type HashedValue,
  murmurhash3_32,
  cyrb53,
} from "./hash-algorithms";

export class SymbolTable {
  private table = new Map<string, any>();
  private hashSize: number;
  private algorithm: HashAlgorithm;

  // Caches for different levels of the hashing process
  private valueToHashCache: LRUCache<string, HashedValue>;
  private stringCache: LRUCache<object, string>;
  private hashToKeyCache: LRUCache<HashedValue, string>;

  // Reusable objects for better performance
  private hasher: CryptoHasher | null = null;
  private hashPool: HashedValue[] = [];
  private poolIndex = 0;
  private readonly POOL_SIZE = 100;

  constructor(
    hashSize: number = 64,
    cacheSize: number = 1000,
    algorithm: HashAlgorithm = HashAlgorithm.SHA256
  ) {
    this.hashSize = hashSize;
    this.algorithm = algorithm;

    if (this.algorithm === HashAlgorithm.SHA256) {
      this.hasher = new Bun.CryptoHasher("sha256");
    }

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
   * Convert arbitrary data to a buffer hash using the selected algorithm
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

    let hashArray: HashedValue;

    // Choose the hashing algorithm
    switch (this.algorithm) {
      case HashAlgorithm.MURMUR3:
        hashArray = murmurhash3_32(inputStr, 0, this.hashSize);
        break;
      case HashAlgorithm.CYRB53:
        hashArray = cyrb53(inputStr, 0, this.hashSize);
        break;
      case HashAlgorithm.SHA256:
      default:
        // Reset hasher state for SHA-256
        if (!this.hasher) {
          this.hasher = new Bun.CryptoHasher("sha256");
        } else {
          this.hasher = new Bun.CryptoHasher("sha256");
        }

        // Get a hash array from the pool
        hashArray = this.getHashArray();

        // Compute the hash
        this.hasher.update(inputStr);
        this.hasher.digest(hashArray);
        break;
    }

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
   * Get or create a buffer hash for binary data directly, skipping string conversion
   */
  getHashForBinary(data: Uint8Array): HashedValue {
    if (this.algorithm === HashAlgorithm.SHA256 && this.hasher) {
      // Reset hasher state
      this.hasher = new Bun.CryptoHasher("sha256");

      // Get a hash array from the pool
      const hashArray = this.getHashArray();

      // Compute the hash directly from binary data
      this.hasher.update(data);
      this.hasher.digest(hashArray);

      // Store and return
      const key = this.getHashKey(hashArray);
      if (!this.table.has(key)) {
        this.table.set(key, data);
      }

      return hashArray;
    } else {
      // Fall back to treating the Uint8Array as a regular value
      return this.getHash(data);
    }
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
   * Change the hashing algorithm
   */
  setAlgorithm(algorithm: HashAlgorithm): void {
    if (this.algorithm !== algorithm) {
      this.algorithm = algorithm;

      // Initialize hasher if using SHA-256
      if (algorithm === HashAlgorithm.SHA256) {
        this.hasher = new Bun.CryptoHasher("sha256");
      } else {
        this.hasher = null;
      }

      // Clear caches since different algorithms will produce different hashes
      this.valueToHashCache.clear();
      this.hashToKeyCache.clear();
    }
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
