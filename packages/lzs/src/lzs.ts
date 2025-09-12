import { LRUCache } from "lru-cache";
import type {
  ILZS,
  ILZSConfig,
  IFlushResult,
  IThroughputMetrics,
  ILZSFactory,
  IKeyGenerator,
  ILZSCache,
  CachedToken,
} from "./domain";
import { escapedHex } from "@tkn/serializers";

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
  readonly _cache: ILZSCache;
  readonly _keyGenerator: IKeyGenerator;
  private _candidate: number[] | null = null;
  private _bytesIn: number = 0;
  private _bytesOut: number = 0;
  private _timeStart: number | null = null;

  constructor({ keyGenerator, cache, trustThreshold = 1 }: ILZSConfig) {
    if (cache.strategy) {
      this._cache = cache.strategy;
    } else {
      this._cache = new LRUCache<number, CachedToken>({
        max: cache.size ?? 10_000,
      });
    }

    this._keyGenerator = keyGenerator;
    this._trustThreshold = Math.max(1, trustThreshold);
  }

  processByte(byte: number): string | null {
    if (this._timeStart === null) this._timeStart = performance.now();
    this._bytesIn += 1;
    const candidateKey = this._keyGenerator.update(byte);
    const cachedCandidate = this._cache.get(candidateKey) ?? { strength: 0 };

    // Initialize the candidate on the first received byte
    if (this._candidate === null) {
      this._candidate = [byte];
      this._cache.set(candidateKey, {
        strength: cachedCandidate.strength + 1,
        bytes: escapedHex(this._candidate),
      });
      return null;
    }

    this._candidate.push(byte);

    if (cachedCandidate.strength === 0) {
      // Set the new candidate in the cache
      const candidateByteString = escapedHex(this._candidate);
      this._cache.set(candidateKey, {
        strength: 1,
        bytes: candidateByteString,
      });
      const previous = this._candidate.splice(0, this._candidate.length - 1);
      this._keyGenerator.recalculate(this._candidate.slice());
      this._bytesOut += previous.length;
      return candidateByteString.slice(0, -4);
    } else if (cachedCandidate.strength < this._trustThreshold) {
      // Increment the candidate in the cache
      this._cache.set(candidateKey, {
        ...cachedCandidate,
        strength: cachedCandidate.strength + 1,
      } as CachedToken); // we know bytes will be set because this token has already been seen
      const previous = this._candidate.splice(0, this._candidate.length - 1);
      this._keyGenerator.recalculate(this._candidate.slice());
      this._bytesOut += previous.length;
      return escapedHex(previous);
    } else {
      // Candidate is trusted, continue accumulating
      this._cache.set(candidateKey, {
        ...cachedCandidate,
        strength: cachedCandidate.strength + 1,
      } as CachedToken); // we know bytes will be set because this token has already been seen
      return null;
    }
  }

  flush(): IFlushResult {
    return {
      cache: this._cache,
      current: this._candidate ? escapedHex(this._candidate) : null,
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
