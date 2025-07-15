import { LRUCache } from "lru-cache";
import type { KeyGenerator } from "./key-generators";

export class LZST {
  private candidate: Uint8Array | null = null;
  readonly memory: LRUCache<number, boolean>;
  readonly generateKey: KeyGenerator;

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
}
