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
  /** Updates the hash with a new int and returns the updated hash value. */
  update(int: number): number;
  /** Resets the hash to its initial seed value. */
  reset(): void;
  /**
   * Resets the hash and recalculates it from a full buffer.
   * This is used when the candidate sequence is reset.
   */
  recalculate(ints: number[]): number;
}
