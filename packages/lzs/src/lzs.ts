import { LRUCache } from "lru-cache";
import {
  type IFlushResult,
  type ILZS,
  type ILZSConfig,
  type ILZSCache,
  type ILZSCacheConfig,
  type IKeyGenerator,
  type IKeyGeneratorConfig,
  isILZSCache,
  isIKeyGenerator,
} from "./domain";
import { ByteTrie, NoOpByteTrie, type IByteTrie } from "./byte-trie";
import { RollingHash } from "@tkn/serializers";
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
  // --- MDL params ---
  private readonly _mdlAlpha: number; // α (Laplace smoothing)
  private readonly _mdlZMode: "child-degree" | "fixed";
  private readonly _mdlZFixed: number; // only used when mode === "fixed"

  // EWMA relative surprise state
  private readonly _mdlBeta: number; // EWMA decay rate
  private readonly _mdlC: number; // surprise tolerance factor
  private _mdlMean: number; // EWMA mean of surprisal
  private _mdlVar: number; // EWMA variance of surprisal

  // Entropy scaling
  private readonly _mdlTau: number; // entropy scaling factor

  // Keep track of the *previous* candidate key (for p(next|prev))
  private _lastCandidateKey: number | null = null;

  private _trustThreshold: number;
  private _monitor: ILZSMonitor;
  private _enableMonitoring: boolean;
  private _trie: IByteTrie;

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

      this._trie.cursorInitFirst(byte);

      // After first byte, previous-key is undefined; set lastCandidateKey= current
      this._lastCandidateKey = candidateKey; // MDL <<<
      return null;
    }

    // Extend candidate by one byte
    this._candidate.push(byte);

    // ----- Trie: O(1) prefix update -----
    this._trie.cursorAdvance(byte, this._trieRootFallback);

    // Always maintain counts
    this._cache.set(candidateKey, strength + 1);

    // === Adaptive MDL gate (EWMA + entropy scaling) ===
    // Use previous candidate key (candidate *before* appending `byte`)
    const prevKey = this._getPrevKey(); // MDL <<<
    if (prevKey !== null) {
      const prevCount = this._getPrevCount(prevKey); // count(prev)
      const candCount = this._cache.get(candidateKey) ?? 0; // count(prev+byte)
      const Z =
        this._mdlZMode === "child-degree"
          ? Math.max(1, this._trie.childDegreeAtParent())
          : Math.max(1, this._mdlZFixed);

      // p(next|prev) with Laplace smoothing
      const numer = candCount + this._mdlAlpha;
      const denom = prevCount + this._mdlAlpha * Z;
      let p = denom > 0 ? numer / denom : 1 / Z; // fallback if denom==0
      if (!(p > 0)) p = Number.EPSILON;

      const s = -Math.log(p); // surprisal in nats

      // EWMA relative surprise gate (#1)
      const mPrev = this._mdlMean;
      this._mdlMean = (1 - this._mdlBeta) * this._mdlMean + this._mdlBeta * s;
      const d = s - mPrev;
      this._mdlVar =
        (1 - this._mdlBeta) * this._mdlVar + this._mdlBeta * (d * d);
      const sigma = Math.sqrt(Math.max(this._mdlVar, 1e-12));

      this.monitorMDLChecked(s, this._mdlMean, sigma); // MDL counters

      // Local entropy scaling gate (#2)
      const H_local = this._computeLocalEntropy();

      // Combined decision: both gates must pass
      const passRelative = s <= this._mdlMean - this._mdlC * sigma;
      const passEntropy = s <= this._mdlTau * H_local;

      if (passRelative && passEntropy) {
        this.monitorMDLExtended();
        // Treat as an extension fast-path
        this.monitorExtension();
        // Update rolling "previous key" to the *current* candidate key
        this._lastCandidateKey = candidateKey; // MDL <<<
        return null;
      }
      // else: let normal logic decide (it will likely emit)
    }

    // ---- Legacy trusted fast path (optional). You can keep or remove. ----
    if (strength >= this._trustThreshold) {
      this.monitorExtension();
      // previous key becomes current
      this._lastCandidateKey = candidateKey; // MDL <<<
      return null;
    }

    // If trie says current candidate is a valid prefix, defer emission
    if (this._trie.cursorValid()) {
      this.monitorTrieHit();
      this._lastCandidateKey = candidateKey; // MDL <<<
      return null;
    }

    // Otherwise emit previous
    if (strength === 0) {
      const emitted = this._boundHandleUnknown(this._candidate);
      this.monitorMDLEmitted(); // MDL <<<
      return emitted;
    }
    const emitted = this._boundHandleUntrusted(this._candidate, strength);
    this.monitorMDLEmitted(); // MDL <<<
    return emitted;
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

    // Mark parent terminal if known, else insert walk-once
    this._trie.insertPreviousOrMark(previous, 1);
    // Re-seed cursor for the single-byte candidate
    this._trie.resetToSingleByte(lastByte);

    // After an emission, we no longer know the key for the *new* 1-byte candidate
    // until the next update(byte) happens, so clear lastCandidateKey.
    this._lastCandidateKey = null; // MDL <<<

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

    this._trie.insertPreviousOrMark(previous, strength + 1);
    this._trie.resetToSingleByte(lastByte);

    this._lastCandidateKey = null; // MDL <<<
    return previous;
  }

  // ---------- MDL helpers ----------
  private _getPrevKey(): number | null {
    return this._lastCandidateKey; // candidate key before appending current byte
  }
  private _getPrevCount(prevKey: number): number {
    return this._cache.get(prevKey) ?? 0;
  }

  // Compute local continuation entropy from trie children
  private _computeLocalEntropy(): number {
    const childDegree = this._trie.childDegreeAtParent();
    if (childDegree <= 1) {
      return 0; // no branching = no entropy
    }

    // Approximate uniform distribution over observed children
    // In practice, you could maintain actual child weights, but this is simpler
    return Math.log(childDegree);
  }

  // ---------- Monitor helpers ----------
  private monitorBytesIn() {
    if (!this._enableMonitoring) return;
    this._monitor.start();
    this._monitor.increment("bytesIn");
  }
  private monitorNull() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("timesNull");
  }
  private monitorExtension() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("timesExtended");
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

    const deg = this._trie.childDegreeAtParent();
    if (deg > 0) this._monitor.increment("hadLongerUnknown");
    this._monitor.increment("childDegreeSumUnknown", deg);
  }
  private monitorUntrustedBranch(previous: number[]) {
    if (!this._enableMonitoring) return;
    this._monitor.increment("bytesOut", previous.length);
    this._monitor.increment("oppUntrusted");

    const deg = this._trie.childDegreeAtParent();
    if (deg > 0) this._monitor.increment("hadLongerUntrusted");
    this._monitor.increment("childDegreeSumUntrusted", deg);
  }

  // ---------- Monitor additions for MDL ----------
  private monitorMDLChecked(negLogP: number, mean: number, std: number) {
    if (!this._enableMonitoring) return;
    this._monitor.increment("mdlChecked");
    this._monitor.increment("mdlSumLogP", negLogP);
    this._monitor.increment("mdlBaselineMeanSum", mean);
    this._monitor.increment("mdlBaselineStdSum", std);
  }
  private monitorMDLExtended() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("mdlExtended");
  }
  private monitorMDLEmitted() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("mdlEmitted");
  }

  // ---------- Management API ----------
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
    this._trie.cursorReset();

    // Reset EWMA state
    this._mdlMean = Math.log(this._mdlZFixed);
    this._mdlVar = 1.0;
    this._lastCandidateKey = null;
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
    trie,
    mdl,
  }: ILZSConfig = {}) {
    this._cache = isILZSCache(cache)
      ? cache
      : new LRUCache<number, number>({ max: cache?.size ?? 10_000 });

    // Trie
    this._trie = trie ?? new ByteTrie();

    this._keyGenerator = isIKeyGenerator(keyGenerator)
      ? keyGenerator
      : new RollingHash(keyGenerator);

    this._trustThreshold = Math.max(1, trustThreshold);

    // --- MDL defaults ---
    this._mdlAlpha = mdl?.alpha ?? 0.1;
    this._mdlZMode = mdl?.zMode ?? "child-degree";
    this._mdlZFixed = mdl?.zFixed ?? 256;

    // EWMA relative surprise parameters
    this._mdlBeta = mdl?.beta ?? 0.02; // decay rate (half-life ~35 steps)
    this._mdlC = mdl?.c ?? 0.7; // surprise tolerance factor
    this._mdlMean = Math.log(this._mdlZFixed); // initialize to uniform surprise
    this._mdlVar = 1.0; // initialize with some variance

    // Entropy scaling parameters
    this._mdlTau = mdl?.tau ?? 0.8; // entropy scaling factor

    // Monitor
    if (!stats || stats.mode === "disabled") {
      this._monitor = new NoOpMonitor();
      this._enableMonitoring = false;
    } else if (stats.monitor) {
      this._monitor = stats.monitor;
      this._enableMonitoring = true;
    } else {
      this._monitor = new LZSMonitor({ mode: stats.mode });
      this._enableMonitoring = true;
    }

    this._boundHandleUnknown = this.handleUnknownCandidate.bind(this);
    this._boundHandleUntrusted = this.handleUntrustedCandidate.bind(this);
  }
}
