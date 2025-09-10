import { LRUCache } from "lru-cache";
import type {
  KeyGenerator,
  ICache,
  ILZS,
  ILZSConfig,
  IFlushResult,
  IThroughputMetrics,
  ILZSFactory,
} from "./domain";

/**
 * Lempel-Ziv Stream Tokenizer (LZS) is a greedy pattern finding algorithm that
 * emits longest known subsequences of input bytes as groups.
 *
 * It uses a dynamic sliding window based on an inclusion heuristic.
 * Known subsequences cause the window to grow, while unknown ones cause it to reset.
 *
 * This algorithm is path dependent, so it requires a persistence layer to contextualize found patterns.
 */
export class LZS implements ILZS {
  private _trustThreshold: number;
  readonly _cache: ICache<number, number>;
  readonly _keyGenerator: KeyGenerator;
  private _candidate: number[] | null = null;
  private _bytesIn: number = 0;
  private _bytesOut: number = 0;
  private _timeStart: number | null = null;

  constructor({
    keyGenerator,
    cache: { size = 10_000, strategy },
    trustThreshold = 1,
  }: ILZSConfig) {
    this._cache =
      strategy ??
      new LRUCache({
        max: size,
      });

    this._keyGenerator = keyGenerator;
    this._trustThreshold = Math.max(1, trustThreshold);
  }

  processByte(byte: number): number[] | null {
    if (this._timeStart === null) this._timeStart = performance.now();
    this._bytesIn += 1;
    const candidateKey = this._keyGenerator.update(byte);
    const timesSeen = this._cache.get(candidateKey) ?? 0;

    // Initialize the candidate on the first received byte
    if (this._candidate === null) {
      this._candidate = [byte];
      if (timesSeen > 0) {
        this._cache.set(candidateKey, timesSeen + 1);
      } else {
        this._cache.set(candidateKey, timesSeen + 1);
      }
      return null;
    }

    this._candidate.push(byte);

    if (timesSeen >= this._trustThreshold) {
      this._cache.set(candidateKey, timesSeen + 1);
      return null;
    } else {
      const previous = this._candidate.splice(0, this._candidate.length - 1);
      // Reset the candidate and recalculate the hash from the new single-byte candidate
      this._cache.set(candidateKey, timesSeen + 1);
      this._keyGenerator.recalculate(new Uint8Array(this._candidate));
      this._bytesOut += previous.length;

      return previous;
    }
  }

  flush(): IFlushResult {
    return {
      memory: this._cache,
      current: this._candidate ? this._candidate : null,
    };
  }

  clear() {
    this._candidate = null;
    this._cache.clear();
    this._keyGenerator.reset();
    this._bytesIn = 0;
    this._bytesOut = 0;
    this._timeStart = null;
  }

  setTrustThreshold(threshold: number): number {
    this._trustThreshold = threshold;
    return threshold;
  }

  get cache() {
    return this._cache;
  }

  get keyGenerator() {
    return this._keyGenerator;
  }

  get memoryUsage() {
    if (typeof process !== "undefined" && process.memoryUsage) {
      return process.memoryUsage().heapUsed; // returns bytes
    }
    return 0; // Return 0 if not running in a Node.js environment
  }

  get throughput(): IThroughputMetrics | null {
    if (!this._timeStart) return null;
    const durationMS = performance.now() - this._timeStart;
    return {
      durationMS,
      bytesIn: this._bytesIn,
      bytesOut: this._bytesOut,
      rateMBs: (this._bytesOut * 0.000001) / (durationMS / 1000),
    };
  }
}

export class LZSFactory implements ILZSFactory {
  create(config: ILZSConfig): ILZS {
    return new LZS(config);
  }
}

// Singleton factory instance for convenience
export const lzsFactory = new LZSFactory();
