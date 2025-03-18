/**
 * SymbolTable - Handles conversion between arbitrary data and buffer hashes
 * Provides efficient storage and lookup of original data
 */

import type { CryptoHasher } from "bun";
import { LRUCache } from "lru-cache";

export type HashedValue = Uint8Array<ArrayBuffer>;

export enum HashAlgorithm {
  SHA256 = "sha256",
  MURMUR3 = "murmur3",
  CYRB53 = "cyrb53",
}

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
   * Implementation of MurmurHash3 (32-bit variant)
   * A fast non-cryptographic hash function
   */
  private murmurhash3_32(data: string, seed = 0): HashedValue {
    let h = seed;
    const k = 0x5bd1e995;
    const r = 24;
    const len = data.length;

    // Process 4 bytes at a time
    for (let i = 0; i < len; i += 4) {
      let k1 =
        data.charCodeAt(i & 0xff) |
        (((i + 1 < len ? data.charCodeAt(i + 1) : 0) & 0xff) << 8) |
        (((i + 2 < len ? data.charCodeAt(i + 2) : 0) & 0xff) << 16) |
        (((i + 3 < len ? data.charCodeAt(i + 3) : 0) & 0xff) << 24);

      k1 = Math.imul(k1, k);
      k1 = (k1 << r) | (k1 >>> (32 - r));
      k1 = Math.imul(k1, k);

      h = Math.imul(h, k);
      h ^= k1;
    }

    // Finalization
    h ^= len;
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;

    // Create HashedValue from the 32-bit integer
    const result = new Uint8Array(this.hashSize);
    for (let i = 0; i < Math.min(4, this.hashSize); i++) {
      result[i] = (h >>> (i * 8)) & 0xff;
    }

    return result;
  }

  /**
   * Implementation of cyrb53 hash
   * A simple and effective 64-bit non-cryptographic hash function
   */
  private cyrb53(str: string, seed = 0): HashedValue {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;

    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    // Create result buffer
    const result = new Uint8Array(this.hashSize);

    // Fill the first 8 bytes with our 64-bit result
    const bytesToFill = Math.min(8, this.hashSize);
    for (let i = 0; i < bytesToFill; i++) {
      if (i < 4) {
        result[i] = (h2 >>> (i * 8)) & 0xff;
      } else {
        result[i] = (h1 >>> ((i - 4) * 8)) & 0xff;
      }
    }

    return result;
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
        hashArray = this.murmurhash3_32(inputStr);
        break;
      case HashAlgorithm.CYRB53:
        hashArray = this.cyrb53(inputStr);
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
