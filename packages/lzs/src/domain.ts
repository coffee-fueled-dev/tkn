/**
 * Configuration for LZS memory management
 */
export interface ICacheConfig {
  strategy?: ICache<number, number>;
  size?: number;
}

/**
 * Configuration interface for LZS instances
 */
export interface ILZSConfig {
  keyGenerator: KeyGenerator;
  cache: ICacheConfig;
  // The number of cache hits required to trust a pattern
  trustThreshold?: number;
}

/**
 * Result of flushing LZS state
 */
export interface IFlushResult {
  memory: ICache<number, number>;
  current: number[] | null;
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
  readonly cache: ICache<number, number>;

  /**
   * The key generator used for hashing patterns
   */
  readonly keyGenerator: KeyGenerator;

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
   * @returns Uint8Array of the longest known subsequence, or null if pattern continues
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
export interface KeyGenerator {
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
  recalculate(buffer: Uint8Array): number;
}

/**
 * Defines a generic interface for a key-value cache.
 * This allows for abstracting the underlying cache implementation (e.g., LRU, LFU)
 * as long as it conforms to this contract.
 */
export interface ICache<K, V> {
  /**
   * Retrieves a value from the cache for the given key.
   * @param key The key to look up.
   * @returns The cached value, or undefined if the key is not in the cache.
   */
  get(key: K): V | undefined;

  /**
   * Stores a key-value pair in the cache.
   * @param key The key to store.
   * @param value The value to associate with the key.
   */
  set(key: K, value: V): void;

  /**
   * Clears all entries from the cache.
   */
  clear(): void;

  /**
   * Returns the number of entries in the cache.
   */
  size: number;
}
