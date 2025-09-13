import { LRUCache } from "lru-cache";
import type {
  ILZS,
  ILZSConfig,
  IFlushResult,
  IKeyGenerator,
  ILZSCache,
} from "./domain";
import { ByteTrie, NoOpByteTrie, type IByteTrie } from "./byte-trie";
import {
  LZSMonitor,
  NoOpMonitor,
  type ILZSMonitor,
  type IStats,
} from "./monitor";

/**
 * Lempel-Ziv Stream Tokenizer (LZS) — refactored to use ByteTrie rolling cursor API.
 * - O(1) prefix checks via trie.cursorAdvance()
 * - O(1) emission by marking parent terminal via trie.insertPreviousOrMark()
 */
export class LZS implements ILZS {
  private _trustThreshold: number;
  private _monitor: ILZSMonitor;
  private _enableMonitoring: boolean;
  private _trie: IByteTrie;
  private _enableTrieSearch: boolean;

  readonly _cache: ILZSCache;
  readonly _keyGenerator: IKeyGenerator;

  private _candidate: number[] | null = null;

  // Pre-bound handlers
  private _boundHandleUnknown: (candidate: number[]) => number[];
  private _boundHandleUntrusted: (
    candidate: number[],
    strength: number
  ) => number[];

  // If you want the old “try root when parent unknown” behavior, set to true:
  private readonly _trieRootFallback = false;

  // ---------- Core streaming logic ----------
  processByte(byte: number): number[] | null {
    this.monitorBytesIn();

    const candidateKey = this._keyGenerator.update(byte);
    const strength = this._cache.get(candidateKey) ?? 0;

    if (this._candidate === null) {
      // Start a new candidate with first byte
      this._candidate = [byte];
      this._cache.set(candidateKey, strength + 1);
      this.monitorNull();

      if (this._enableTrieSearch) this._trie.cursorInitFirst(byte);
      return null;
    }

    // Extend candidate by one byte
    this._candidate.push(byte);

    // ----- Trie: O(1) prefix update -----
    if (this._enableTrieSearch) {
      this._trie.cursorAdvance(byte, this._trieRootFallback);
    }

    // ----- Trusted fast path -----
    if (strength >= this._trustThreshold) {
      this.monitorExtension();
      this._cache.set(candidateKey, strength + 1);
      return null;
    }

    // ----- Unknown / Untrusted slow path -----
    this._cache.set(candidateKey, strength + 1);

    // If trie says current candidate is a valid prefix, defer emission
    if (this._enableTrieSearch && this._trie.cursorValid()) {
      this.monitorTrieHit();
      return null;
    }

    // Otherwise emit previous
    if (strength === 0) return this._boundHandleUnknown(this._candidate);
    return this._boundHandleUntrusted(this._candidate, strength);
  }

  // ---------- Emit handlers (O(1) on trie) ----------
  private handleUnknownCandidate(candidate: number[]): number[] {
    const lastByte = candidate[candidate.length - 1];
    const previous = candidate.slice(0, -1);

    this.monitorUnknownBranch(previous);

    // Keep last byte as new 1-byte candidate
    candidate.length = 1;
    candidate[0] = lastByte;
    this._keyGenerator.recalculate(candidate);

    if (this._enableTrieSearch) {
      // Mark parent terminal if known, else insert walk-once
      this._trie.insertPreviousOrMark(previous, 1);
      // Re-seed cursor for the single-byte candidate
      this._trie.resetToSingleByte(lastByte);
    }

    return previous;
  }

  private handleUntrustedCandidate(
    candidate: number[],
    strength: number
  ): number[] {
    const lastByte = candidate[candidate.length - 1];
    const previous = candidate.slice(0, -1);

    this.monitorUntrustedBranch(previous);

    candidate.length = 1;
    candidate[0] = lastByte;
    this._keyGenerator.recalculate(candidate);

    if (this._enableTrieSearch) {
      this._trie.insertPreviousOrMark(previous, strength + 1);
      this._trie.resetToSingleByte(lastByte);
    }

    return previous;
  }

  // ---------- Monitor helpers ----------
  private monitorBytesIn() {
    if (!this._enableMonitoring) return;
    this._monitor.start();
    this._monitor.increment("bytesIn");
  }
  private monitorNull() {
    if (this._enableMonitoring) this._monitor.increment("timesNull");
  }
  private monitorExtension() {
    if (this._enableMonitoring) this._monitor.increment("timesExtended");
  }
  private monitorTrieHit() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("timesDeferred");
    this._monitor.increment("timesExtended");
  }
  private monitorUnknownBranch(previous: number[]) {
    if (!this._enableMonitoring) return;
    this._monitor.increment("bytesOut", previous.length);
    this._monitor.increment("oppUnknown");

    if (this._enableTrieSearch) {
      const deg = this._trie.childDegreeAtParent();
      if (deg > 0) this._monitor.increment("hadLongerUnknown");
      this._monitor.increment("childDegreeSumUnknown", deg);
    }
  }
  private monitorUntrustedBranch(previous: number[]) {
    if (!this._enableMonitoring) return;
    this._monitor.increment("bytesOut", previous.length);
    this._monitor.increment("oppUntrusted");

    if (this._enableTrieSearch) {
      const deg = this._trie.childDegreeAtParent();
      if (deg > 0) this._monitor.increment("hadLongerUntrusted");
      this._monitor.increment("childDegreeSumUntrusted", deg);
    }
  }

  // ---------- Public API ----------
  flush(): IFlushResult {
    return {
      cache: this._cache,
      current: this._candidate ? this._candidate : null,
    };
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
    if (typeof process !== "undefined" && (process as any).memoryUsage) {
      return (process as any).memoryUsage().heapUsed;
    }
    return 0;
  }

  clear() {
    this._candidate = null;
    this._cache.clear();
    this._keyGenerator.reset();
    this._monitor.reset();
    if (this._enableTrieSearch) this._trie.cursorReset();
  }

  get stats(): IStats | null {
    return this._monitor.stats;
  }

  // ---------- Ctor ----------
  constructor({
    keyGenerator,
    cache,
    trustThreshold = 1,
    stats,
    trieSearch,
  }: ILZSConfig) {
    // Cache
    this._cache =
      cache.strategy ??
      new LRUCache<number, number>({ max: cache.size ?? 10_000 });

    // Trie
    if (trieSearch?.trie) {
      this._trie = trieSearch.trie;
      this._enableTrieSearch = true;
    } else {
      switch (trieSearch?.mode) {
        case "disabled":
          this._trie = new NoOpByteTrie();
          this._enableTrieSearch = false;
          break;
        default:
          this._trie = new ByteTrie();
          this._enableTrieSearch = true;
          break;
      }
    }

    // Trust
    this._keyGenerator = keyGenerator;
    this._trustThreshold = Math.max(1, trustThreshold);

    // Monitor
    if (stats?.monitor) {
      this._monitor = stats.monitor;
      this._enableMonitoring = true;
    } else {
      switch (stats?.mode) {
        case "extended":
          this._monitor = new LZSMonitor(true);
          this._enableMonitoring = true;
          break;
        case "simple":
          this._monitor = new LZSMonitor(false);
          this._enableMonitoring = true;
          break;
        default:
          this._monitor = new NoOpMonitor();
          this._enableMonitoring = false;
          break;
      }
    }

    this._boundHandleUnknown = this.handleUnknownCandidate.bind(this);
    this._boundHandleUntrusted = this.handleUntrustedCandidate.bind(this);
  }
}
