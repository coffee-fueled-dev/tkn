/**
 * Result of flushing LZS state
 */
export interface IFlushResult {
  cache: ILZSCache;
  current: number[] | null;
}

/**
 * Configuration for LZS memory management
 */
export interface ILZSCacheConfig {
  size?: number;
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

/**
 * Type guards for constructor pattern
 */
export function isILZSCache(obj: any): obj is ILZSCache {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.get === "function" &&
    typeof obj.set === "function" &&
    typeof obj.clear === "function" &&
    typeof obj.size === "number" &&
    typeof obj.values === "function"
  );
}

export interface IKeyGeneratorConfig {
  seed?: number;
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

export function isIKeyGenerator(obj: any): obj is IKeyGenerator {
  return (
    obj &&
    typeof obj === "object" &&
    typeof obj.update === "function" &&
    typeof obj.reset === "function" &&
    typeof obj.recalculate === "function" &&
    typeof obj.value === "number"
  );
}
