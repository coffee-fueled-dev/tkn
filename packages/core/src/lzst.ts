import { LRUCache } from "lru-cache";
import type { KeyGenerator } from "./key-generators";

/**
 * Lempel-Ziv Stream Tokenizer (LZST) is a lossless data compression algorithm that uses a dictionary of
 * previously seen sequences to compress data.
 *
 * It is a variant of the LZ77 algorithm that uses a dictionary of previously
 * seen sequences to compress data.
 */
export class LZST {
  private candidate: Uint8Array | null = null;
  readonly memory: LRUCache<number, boolean>;
  readonly generateKey: KeyGenerator;
  private bytesIn: number = 0;
  private bytesOut: number = 0;
  private timeStart: number | null = null;

  constructor({
    memorySize = 10_000,
    keyGenerator,
  }: {
    memorySize: number;
    keyGenerator: KeyGenerator;
  }) {
    this.memory = new LRUCache({
      max: memorySize,
    });
    this.generateKey = keyGenerator;
  }

  processByte(byte: number) {
    if (this.timeStart === null) this.timeStart = performance.now();
    this.bytesIn += 1;
    if (this.candidate === null) {
      this.candidate = new Uint8Array([byte]);
      this.memory.set(this.generateKey(this.candidate), true);
      return null;
    }

    const previous = this.candidate;
    this.candidate = new Uint8Array([...previous, byte]);
    const candidateKey = this.generateKey(this.candidate);
    const seenPreviously = this.memory.has(candidateKey);

    if (seenPreviously) {
      this.memory.set(candidateKey, true);
      return null;
    } else {
      this.memory.set(candidateKey, true);
      this.candidate = new Uint8Array([byte]);
      this.bytesOut += previous.length;
      return previous;
    }
  }

  getMemory() {
    return this.memory;
  }

  getKeyGenerator() {
    return this.generateKey;
  }

  flush() {
    const memory = this.memory;
    const current = this.candidate;

    return {
      memory,
      current,
    };
  }

  clear() {
    this.candidate = new Uint8Array();
    this.memory.clear();
  }

  throughput() {
    if (!this.timeStart) return null;
    const durationMS = performance.now() - this.timeStart;
    return {
      durationMS,
      bytesIn: this.bytesIn,
      bytesOut: this.bytesOut,
      rateMBs: (this.bytesOut * 0.000001) / (durationMS / 1000),
    };
  }
}
