import type {
  IKeyGenerator,
  IKeyGeneratorConfig,
} from "./key-generator.domain";

export const DEFAULT_HASH_SEED = 0x811c9dc5; // FNV offset basis

export class KeyGenerator implements IKeyGenerator {
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
    const v = int | 0; // Ensure it's an int32 but keep the sign
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
  recalculate(buffer: number[]): number {
    this._hash = this.HASH_SEED;
    for (let i = 0; i < buffer.length; i++) {
      this.update(buffer[i]);
    }
    return this._hash;
  }
}

export function isIKeyGenerator(obj: unknown): obj is IKeyGenerator {
  if (typeof obj !== "object" || obj === null) return false;
  const keyGenerator = obj as IKeyGenerator;
  return (
    typeof keyGenerator.update === "function" &&
    typeof keyGenerator.reset === "function" &&
    typeof keyGenerator.recalculate === "function" &&
    typeof keyGenerator.value === "number"
  );
}
