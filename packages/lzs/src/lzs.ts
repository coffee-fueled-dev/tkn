import { LRUCache } from "lru-cache";
import type { ILZS, ILZSConfig } from "./lzs.domain";
import type { IFlushResult, ILZSCache, IKeyGenerator } from "./_shared.domain";
import { isILZSCache, isIKeyGenerator } from "./_shared.domain";
import { ByteTrie, NoOpByteTrie } from "./byte-trie";
import type { IByteTrie } from "./byte-trie.domain";
import { RollingHash } from "@tkn/serializers";
import { LZSMonitor, NoOpLZSMonitor } from "./monitor";
import type { ILZSMonitor, IStats } from "./monitor.domain";

/**
 * Lempel-Ziv Stream Tokenizer (LZS) — refactored to use ByteTrie rolling cursor API.
 * - O(1) prefix checks via trie.cursorAdvance()
 * - O(1) emission by marking parent terminal via trie.insertPreviousOrMark()
 */
export class LZS implements ILZS {
  private _monitor: ILZSMonitor;
  private _enableMonitoring: boolean;
  private _trie: IByteTrie;
  readonly _cache: ILZSCache;
  readonly _keyGenerator: IKeyGenerator;
  private _candidate: number[] | null = null;

  // --- MDL params ---
  private readonly _oneMinusBeta: number; // = 1 - _mdlBeta
  private readonly _c2: number; // = (_mdlC * _mdlC)

  // Probability-domain EWMA (no logs)
  private _ewmaP: number = 0.2; // init to a mild prior in [0,1]
  private _ewmaP2: number = 0.08; // ~ ewmaP^2 to start

  // Degree -> entropy threshold table: thr[d] = d^{-tau}
  private _degThr!: Float64Array; // build once

  private _initMDLTables(maxDeg = 512) {
    const tbl = new Float64Array(maxDeg + 1);
    tbl[0] = 0; // no branching: threshold 0 (always passes entropy check)
    for (let d = 1; d <= maxDeg; d++) {
      // thr(d) = exp(-tau * ln d) = d^{-tau}
      tbl[d] = Math.exp(-this._mdlTau * Math.log(d));
    }
    this._degThr = tbl;
  }

  private readonly _mdlAlpha: number; // α (Laplace smoothing)
  private readonly _mdlZMode: "child-degree" | "fixed";
  private readonly _mdlZFixed: number; // only used when mode === "fixed"

  // EWMA relative surprise state
  private readonly _mdlBeta: number; // EWMA decay rate
  private readonly _mdlC: number; // surprise tolerance factor

  // Entropy scaling
  private readonly _mdlTau: number; // entropy scaling factor

  // Keep track of the *previous* candidate key (for p(next|prev))
  private _lastCandidateKey: number | null = null;

  // Pre-bound handlers
  private _handleUnknownCandidate: (candidate: number[]) => number[];

  private readonly _trieRootFallback = false;

  processByte(byte: number): number[] | null {
    this.monitorBytesIn();

    const candidateKey = this._keyGenerator.update(byte);
    const strength = this._cache.get(candidateKey) ?? 0;

    if (this._candidate === null) {
      // Start a new candidate with first byte
      this._candidate = [byte];
      this._cache.set(candidateKey, strength + 1);
      this.monitorCandidateStarted();

      this._trie.cursorInitFirst(byte);

      // After first byte, previous-key is undefined; set lastCandidateKey= current
      this._lastCandidateKey = candidateKey; // MDL <<<
      return null;
    }

    // Extend candidate by one byte
    this._candidate.push(byte);

    this._trie.cursorAdvance(byte, this._trieRootFallback);

    // Always maintain counts
    this._cache.set(candidateKey, strength + 1);

    // Gate 1: MDL gate (most restrictive)
    this.monitorMDLGateChecked();
    if (this.useMDLGate(candidateKey)) {
      this.monitorMDLGatePassed();
      return null;
    }
    this.monitorMDLGateFailed();

    // Gate 2: Cache gate (check if we've seen this sequence before)
    this.monitorCacheGateChecked();
    if (strength >= 2) {
      this.monitorCacheGatePassed();
      this._lastCandidateKey = candidateKey; // MDL <<<
      return null;
    }
    this.monitorCacheGateFailed();

    // Gate 3: Trie gate (check if this could be extended further)
    this.monitorTrieGateChecked();
    if (this._trie.cursorValid()) {
      this.monitorTrieGatePassed();
      this._lastCandidateKey = candidateKey; // MDL <<<
      return null;
    }
    this.monitorTrieGateFailed();

    // All gates failed - emit the token
    this.monitorTokenEmission();
    return this._handleUnknownCandidate(this._candidate);
  }
  // Fast, allocation-free MDL-ish gate in probability space
  private useMDLGate(candidateKey: number): boolean {
    // previous candidate key before appending this byte
    const prevKey = this._lastCandidateKey;
    if (prevKey === null) return false;

    // counts
    const prevCount = this._cache.get(prevKey) ?? 0; // c
    const candCount = this._cache.get(candidateKey) ?? 0; // r

    // branching factor Z
    let Z: number;
    if (this._mdlZMode === "child-degree") {
      // childDegreeAtParent() returns small int; clamp to table range [0..512]
      const deg = this._trie.childDegreeAtParent();
      Z = deg > 512 ? 512 : deg | 0; // int clamp
    } else {
      Z = this._mdlZFixed | 0;
    }
    if (Z <= 0) Z = 1;

    // Laplace-smoothed conditional p = (r + alpha) / (c + alpha * Z)
    const numer = candCount + this._mdlAlpha;
    const denom = prevCount + this._mdlAlpha * Z;
    // denom should be > 0 except at very early cold-start
    let p = denom > 0 ? numer / denom : 1 / Z;
    if (p <= 0) p = Number.EPSILON;
    if (p >= 1) p = 1 - 1e-12;

    // ---- EWMA in probability space (no logs) ----
    // Update means BEFORE thresholding (so state isn't biased by gate result)
    const meanPrev = this._ewmaP;
    const p2 = p * p;

    // Exponential moving avg of p and p^2
    this._ewmaP = this._oneMinusBeta * this._ewmaP + this._mdlBeta * p;
    this._ewmaP2 = this._oneMinusBeta * this._ewmaP2 + this._mdlBeta * p2;

    // variance and "relative surprise" test without sqrt:
    // passRelative if (meanPrev - p)^2 >= (c^2) * var, with p <= meanPrev
    // (If p > meanPrev, it's not "surprisingly low", so fail fast)
    const varP = this._ewmaP2 - this._ewmaP * this._ewmaP;
    const diff = meanPrev - p;
    const passRelative =
      diff > 0 && diff * diff >= this._c2 * (varP > 0 ? varP : 1e-12);

    // ---- Entropy scaling: p must also exceed degree^{-tau} ----
    // thrDeg = d^{-tau}; we precomputed into _degThr
    // For Z from child-degree, use Z; for fixed mode, we can treat Z as branching proxy as well.
    const thrDeg = this._degThr[Z <= 512 ? Z : 512];
    const passEntropy = p >= thrDeg;

    this.monitorMDLMetrics(p, thrDeg, varP);
    if (passRelative && passEntropy) {
      // Accept extension; roll previous key forward
      this._lastCandidateKey = candidateKey;
      return true;
    }
    return false;
  }

  // ---------- Emit handlers (O(1) on trie) ----------
  private handleUnknownCandidate(candidate: number[]): number[] {
    const lastByte = candidate[candidate.length - 1];
    const previous = candidate.slice(0, -1);

    this.monitorBytesOut(previous.length);
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

  // ---------- Monitor helpers ----------
  private monitorBytesIn() {
    if (!this._enableMonitoring) return;
    this._monitor.start();
    this._monitor.increment("bytesIn");
  }

  private monitorBytesOut(bytes: number) {
    if (!this._enableMonitoring) return;
    this._monitor.increment("bytesOut", bytes);
  }

  private monitorCandidateStarted() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("candidatesStarted");
  }

  // MDL Gate monitoring
  private monitorMDLGateChecked() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("mdlGateChecked");
  }

  private monitorMDLGatePassed() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("mdlGatePassed");
  }

  private monitorMDLGateFailed() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("mdlGateFailed");
  }

  // Cache Gate monitoring
  private monitorCacheGateChecked() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("cacheGateChecked");
  }

  private monitorCacheGatePassed() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("cacheGatePassed");
  }

  private monitorCacheGateFailed() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("cacheGateFailed");
  }

  // Trie Gate monitoring
  private monitorTrieGateChecked() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("trieGateChecked");
  }

  private monitorTrieGatePassed() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("trieGatePassed");
  }

  private monitorTrieGateFailed() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("trieGateFailed");
  }

  // Token emission monitoring
  private monitorTokenEmission() {
    if (!this._enableMonitoring) return;
    this._monitor.increment("tokensEmitted");
    const deg = this._trie.childDegreeAtParent();
    if (deg > 0) this._monitor.increment("emissionHadLongerOptions");
    this._monitor.increment("emissionSumChildDegree", deg);
  }

  // MDL algorithm metrics
  private monitorMDLMetrics(surprisal: number, mean: number, std: number) {
    if (!this._enableMonitoring) return;
    this._monitor.increment("mdlSumSurprisal", surprisal);
    this._monitor.increment("mdlSumBaselineMean", mean);
    this._monitor.increment("mdlSumBaselineStd", std);
  }

  // ---------- Management API ----------
  flush(): IFlushResult {
    return {
      cache: this._cache,
      current: this._candidate ? this._candidate : null,
    };
  }

  get cache() {
    return this._cache;
  }
  get keyGenerator() {
    return this._keyGenerator;
  }
  get memoryUsage() {
    if (typeof process !== "undefined" && (process as any).memoryUsage) {
      return process.memoryUsage().heapUsed;
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
    this._lastCandidateKey = null;
  }

  get stats(): IStats | null {
    return this._monitor.stats;
  }

  // ---------- Ctor ----------
  constructor({ keyGenerator, cache, monitor, trie, mdl }: ILZSConfig = {}) {
    this._cache = isILZSCache(cache)
      ? cache
      : new LRUCache<number, number>({ max: cache?.size ?? 10_000 });

    // Trie
    this._trie = trie ? new ByteTrie() : new NoOpByteTrie();

    this._keyGenerator = isIKeyGenerator(keyGenerator)
      ? keyGenerator
      : new RollingHash(keyGenerator);

    // --- MDL defaults ---
    this._mdlAlpha = mdl?.alpha ?? 0.1;
    this._mdlZMode = mdl?.zMode ?? "child-degree";
    this._mdlZFixed = mdl?.zFixed ?? 256;

    // EWMA relative surprise parameters
    this._mdlBeta = mdl?.beta ?? 0.02; // decay rate (half-life ~35 steps)
    this._mdlC = mdl?.c ?? 0.7; // surprise tolerance factor

    // Entropy scaling parameters
    this._mdlTau = mdl?.tau ?? 0.8; // entropy scaling factor

    this._oneMinusBeta = 1 - this._mdlBeta;
    this._c2 = this._mdlC * this._mdlC;
    this._initMDLTables(512);

    this._monitor =
      monitor instanceof LZSMonitor
        ? monitor
        : monitor
        ? new LZSMonitor(monitor)
        : new NoOpLZSMonitor();

    this._enableMonitoring = this._monitor.config.mode !== "disabled";

    this._handleUnknownCandidate = this.handleUnknownCandidate.bind(this);
  }
}
