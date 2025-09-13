import type { IByteTrie } from "./byte-trie";
import type { ILZSMonitor, IStats } from "./monitor";

/**
 * Configuration for LZS memory management
 */
export interface ICacheConfig {
  strategy?: ILZSCache;
  size?: number;
}

/**
 * Configuration interface for LZS instances
 */
export interface ILZSConfig {
  keyGenerator: IKeyGenerator;
  cache: ICacheConfig;
  // The number of cache hits required to trust a pattern
  trustThreshold?: number;
  stats?: {
    mode?: "none" | "simple" | "extended";
    monitor?: ILZSMonitor;
  };
  trieSearch?: {
    mode?: "enabled" | "disabled";
    trie?: IByteTrie;
  };
}

/**
 * Result of flushing LZS state
 */
export interface IFlushResult {
  cache: ILZSCache;
  current: number[] | null;
}

/**
 * Interface for Lempel-Ziv Stream Tokenizer
 * Defines the contract for the core, synchronous pattern finding and tokenization logic.
 */
export interface ILZS {
  readonly cache: ILZSCache;

  /**
   * The key generator used for hashing patterns
   */
  readonly keyGenerator: IKeyGenerator;

  /**
   * Current memory usage in bytes (platform dependent)
   */
  readonly memoryUsage: number;

  /**
   * Current throughput metrics, null if no processing has occurred
   */
  readonly stats: IStats | null;

  /**
   * Processes a single byte and returns the longest known subsequence if found
   * @param byte The byte to process
   * @returns Hex bytes string of the longest known subsequence, or null if pattern continues
   */
  processByte(byte: number): number[] | null;

  /**
   * Flushes the current state and returns memory and current candidate
   * @returns Object containing the cache memory and current candidate bytes
   */
  flush(): IFlushResult;

  /**
   * Clears all internal state including cache, candidate, and metrics
   */
  clear(): void;

  /**
   * Updates the trust threshold for pattern matching
   * @param threshold The new trust threshold
   */
  setTrustThreshold(threshold: number): number;
}

/**
 * Defines the interface for a stateful hash generator that can be updated
 * incrementally.
 */
export interface IKeyGenerator {
  /** Returns the current value of the hash. */
  readonly value: number;

  /** Updates the hash with a new byte and returns the new hash value. */
  update(byte: number): number;

  /** Resets the hash to its initial seed value. */
  reset(): void;

  /**
   * Resets the hash and recalculates it from a full buffer.
   * This is used when the candidate sequence is reset.
   */
  recalculate(buffer: Uint8Array | number[]): number;
}

/**
 * Defines a generic interface for a token cache.
 * This allows for abstracting the underlying cache implementation (e.g., LRU, LFU)
 * as long as it conforms to this contract.
 */
export interface ILZSCache {
  /**
   * Retrieves a token's strength from the cache for the given key.
   * @param hash The hash of the token to look up.
   * @returns The cached strength, or undefined if the token is not in the cache.
   */
  get(hash: number | undefined): number | undefined;

  /**
   * Stores a key-value pair in the cache.
   * @param hash The hash of the token to store.
   * @param strength The strength of the token.
   */
  set(hash: number, strength: number): void;

  /**
   * Clears all entries from the cache.
   */
  clear(): void;

  /**
   * Returns the number of entries in the cache.
   */
  size: number;

  values(): Generator<number, void, unknown>;
}
