import type { IKeyGenerator, IKeyGeneratorConfig } from "@tkn/lzs";

/**
 * Implements a polynomial rolling hash that can be updated in O(1) time.
 * This is ideal for stream processing as it avoids re-hashing the entire
 * sequence on every new byte.
 */
export const DEFAULT_HASH_SEED = 0x811c9dc5; // FNV offset basis

export class RollingHash implements IKeyGenerator {
  private readonly HASH_PRIME = 31;
  private readonly HASH_SEED: number;

  private _hash: number;

  constructor(config?: IKeyGeneratorConfig) {
    this.HASH_SEED = config?.seed ?? DEFAULT_HASH_SEED;
    this._hash = this.HASH_SEED;
  }

  get value(): number {
    return this._hash;
  }

  update(int: number): number {
    const v = (int | 0) >>> 0; // int32 → uint32
    this._hash = (Math.imul(this._hash, this.HASH_PRIME) + v) >>> 0;
    return this._hash;
  }

  reset(): void {
    this._hash = this.HASH_SEED;
  }

  /**
   * Recalculate hash from scratch given a buffer.
   * Works with Uint8Array or plain number[].
   */
  recalculate(buffer: Uint8Array | number[]): number {
    this._hash = this.HASH_SEED;
    for (let i = 0; i < buffer.length; i++) {
      this.update(buffer[i]);
    }
    return this._hash;
  }
}
