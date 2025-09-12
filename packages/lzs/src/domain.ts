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
}

/**
 * Result of flushing LZS state
 */
export interface IFlushResult {
  cache: ILZSCache;
  current: string | null;
}

/**
 * Throughput metrics for LZS performance
 */
export interface IThroughputMetrics {
  durationMS: number;
  bytesIn: number;
  bytesOut: number;
  rateMBs: number;
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
  readonly throughput: IThroughputMetrics | null;

  /**
   * Processes a single byte and returns the longest known subsequence if found
   * @param byte The byte to process
   * @returns Hex bytes string of the longest known subsequence, or null if pattern continues
   */
  processByte(byte: number): string | null;

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
 * Factory interface for creating LZS instances
 */
export interface ILZSFactory {
  create(config: ILZSConfig): ILZS;
}

/**
 * Interface for the LZS Stream Adapter.
 * Provides a streaming interface on top of a core ILZS instance.
 */
export interface ILZSStream {
  /**
   * A readable stream for the output tokens.
   */
  readonly readable: ReadableStream<Uint8Array | null>;
  /**
   * A writable stream for the input bytes.
   */
  readonly writable: WritableStream<number>;
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

export type CachedToken = {
  strength: number;
  bytes: string; // Hex string of the token's bytes
};

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
  get(hash: number | undefined): CachedToken | undefined;

  /**
   * Stores a key-value pair in the cache.
   * @param hash The hash of the token to store.
   * @param strength The strength of the token.
   */
  set(hash: number, token: CachedToken): void;

  /**
   * Clears all entries from the cache.
   */
  clear(): void;

  /**
   * Returns the number of entries in the cache.
   */
  size: number;

  values(): Generator<CachedToken, void, unknown>;
}
