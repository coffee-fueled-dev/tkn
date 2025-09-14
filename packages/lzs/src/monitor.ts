/**
 * Throughput metrics for LZS performance
 */
export interface IStats {
  // Basic performance
  durationMS: number;
  bytesIn: number;
  bytesOut: number;
  rateMBs: number;

  // Candidate flow
  candidatesStarted: number;
  tokensEmitted: number;

  // Gate behavior (understanding greediness vs panic)
  mdlGateChecked: number;
  mdlGatePassed: number;
  mdlGateFailRate: number;

  cacheGateChecked: number;
  cacheGatePassed: number;
  cacheGateFailRate: number;

  trieGateChecked: number;
  trieGatePassed: number;
  trieGateFailRate: number;

  // Emission quality metrics
  emissionHadLongerOptions: number;
  emissionMissedExtensionRate: number;
  emissionAvgChildDegree: number;

  // MDL algorithm insights
  avgMDLSurprisal: number;
  mdlBaselineMean: number;
  mdlBaselineStd: number;
}

/**
 * Counter types for performance monitoring
 *
 * Flow-based naming:
 * - Input: bytesIn, candidatesStarted
 * - Gates: mdl*, cache*, trie*, emission*
 * - Output: bytesOut, tokensEmitted
 */
export type CounterType =
  // Input metrics
  | "bytesIn"
  | "bytesOut"
  | "candidatesStarted"

  // Gate decision metrics (continue vs emit)
  | "mdlGateChecked"
  | "mdlGatePassed"
  | "mdlGateFailed"
  | "cacheGateChecked"
  | "cacheGatePassed"
  | "cacheGateFailed"
  | "trieGateChecked"
  | "trieGatePassed"
  | "trieGateFailed"

  // Emission metrics
  | "tokensEmitted"
  | "emissionHadLongerOptions"
  | "emissionSumChildDegree"

  // MDL algorithm metrics
  | "mdlSumSurprisal"
  | "mdlSumBaselineMean"
  | "mdlSumBaselineStd";

/**
 * Interface for performance monitoring with async counter updates
 */
export interface ILZSMonitor {
  /**
   * Stats mode
   */
  readonly _mode: "disabled" | "performance-only" | "extended";

  /**
   * Increment a counter by the specified amount
   */
  increment(counter: CounterType, amount?: number): void;

  /**
   * Get current counter values (forces flush of pending updates)
   */
  getCounters(): Record<CounterType, number>;

  /**
   * Reset all counters to zero
   */
  reset(): void;

  /**
   * Force flush any pending counter updates
   */
  flush(): void;

  /**
   * Start tracking time. This will skip if there's already a running timer
   */
  start(): void;

  /**
   * Get current stats
   */
  stats: IStats | null;
}

export interface ILZMonitorConfig {
  mode?: "disabled" | "performance-only" | "extended";
  batchSize?: number;
}

/**
 * High-performance monitor with batched async counter updates
 * Minimizes hot path overhead by batching counter increments
 */
export class LZSMonitor implements ILZSMonitor {
  readonly _mode: "disabled" | "performance-only" | "extended";
  private _timeStart: number | null = null;

  // Current counter values
  private _counters: Record<CounterType, number> = {
    bytesIn: 0,
    bytesOut: 0,
    candidatesStarted: 0,
    mdlGateChecked: 0,
    mdlGatePassed: 0,
    mdlGateFailed: 0,
    cacheGateChecked: 0,
    cacheGatePassed: 0,
    cacheGateFailed: 0,
    trieGateChecked: 0,
    trieGatePassed: 0,
    trieGateFailed: 0,
    tokensEmitted: 0,
    emissionHadLongerOptions: 0,
    emissionSumChildDegree: 0,
    mdlSumSurprisal: 0,
    mdlSumBaselineMean: 0,
    mdlSumBaselineStd: 0,
  };

  // Batched pending updates
  private _pending: Record<CounterType, number> = {
    bytesIn: 0,
    bytesOut: 0,
    candidatesStarted: 0,
    mdlGateChecked: 0,
    mdlGatePassed: 0,
    mdlGateFailed: 0,
    cacheGateChecked: 0,
    cacheGatePassed: 0,
    cacheGateFailed: 0,
    trieGateChecked: 0,
    trieGatePassed: 0,
    trieGateFailed: 0,
    tokensEmitted: 0,
    emissionHadLongerOptions: 0,
    emissionSumChildDegree: 0,
    mdlSumSurprisal: 0,
    mdlSumBaselineMean: 0,
    mdlSumBaselineStd: 0,
  };

  private _batchSize: number;
  private _batchCount = 0;
  private _flushTimer: Timer | null = null;

  constructor({ mode = "disabled", batchSize = 1000 }: ILZMonitorConfig) {
    this._mode = mode;
    this._batchSize = batchSize;
  }

  start(): void {
    if (this._timeStart) return;
    this._timeStart = performance.now();
  }

  increment(counter: CounterType, amount = 1): void {
    // Always track basic performance metrics regardless of mode
    const isBasicCounter =
      counter === "bytesIn" ||
      counter === "bytesOut" ||
      counter === "candidatesStarted" ||
      counter === "tokensEmitted";
    if (!(this._mode === "extended") && !isBasicCounter) return;

    this._pending[counter] += amount;
    this._batchCount++;

    // Immediate flush for small batches or periodic flush for large ones
    if (this._batchCount >= this._batchSize) {
      this.flush();
    } else if (!this._flushTimer) {
      // Micro-task flush for low-latency updates
      this._flushTimer = setTimeout(() => this.flush(), 0);
    }
  }

  getCounters(): Record<CounterType, number> {
    this.flush(); // Ensure all pending updates are included
    return { ...this._counters };
  }

  reset(): void {
    // Reset both current and pending counters
    Object.keys(this._counters).forEach((key) => {
      this._counters[key as CounterType] = 0;
      this._pending[key as CounterType] = 0;
    });
    this._batchCount = 0;
    this._clearFlushTimer();
    this._timeStart = null;
  }

  flush(): void {
    if (this._batchCount === 0) return;

    // Apply all pending updates atomically
    Object.keys(this._pending).forEach((key) => {
      const counterKey = key as CounterType;
      this._counters[counterKey] += this._pending[counterKey];
      this._pending[counterKey] = 0;
    });

    this._batchCount = 0;
    this._clearFlushTimer();
  }

  private _clearFlushTimer(): void {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
  }

  get stats(): IStats | null {
    if (!this._timeStart) return null;
    const durationMS = performance.now() - this._timeStart;
    const counters = this.getCounters();

    return {
      // Basic performance
      durationMS,
      bytesIn: counters.bytesIn,
      bytesOut: counters.bytesOut,
      rateMBs: (counters.bytesOut * 0.000001) / (durationMS / 1000),

      // Candidate flow
      candidatesStarted: counters.candidatesStarted,
      tokensEmitted: counters.tokensEmitted,

      // Gate behavior (understanding greediness vs panic)
      mdlGateChecked: counters.mdlGateChecked,
      mdlGatePassed: counters.mdlGatePassed,
      mdlGateFailRate: counters.mdlGateChecked
        ? counters.mdlGateFailed / counters.mdlGateChecked
        : 0,

      cacheGateChecked: counters.cacheGateChecked,
      cacheGatePassed: counters.cacheGatePassed,
      cacheGateFailRate: counters.cacheGateChecked
        ? counters.cacheGateFailed / counters.cacheGateChecked
        : 0,

      trieGateChecked: counters.trieGateChecked,
      trieGatePassed: counters.trieGatePassed,
      trieGateFailRate: counters.trieGateChecked
        ? counters.trieGateFailed / counters.trieGateChecked
        : 0,

      // Emission quality metrics
      emissionHadLongerOptions: counters.emissionHadLongerOptions,
      emissionMissedExtensionRate: counters.tokensEmitted
        ? counters.emissionHadLongerOptions / counters.tokensEmitted
        : 0,
      emissionAvgChildDegree: counters.tokensEmitted
        ? counters.emissionSumChildDegree / counters.tokensEmitted
        : 0,

      // MDL algorithm insights
      avgMDLSurprisal: counters.mdlGateChecked
        ? counters.mdlSumSurprisal / counters.mdlGateChecked
        : 0,
      mdlBaselineMean: counters.mdlGateChecked
        ? counters.mdlSumBaselineMean / counters.mdlGateChecked
        : 0,
      mdlBaselineStd: counters.mdlGateChecked
        ? counters.mdlSumBaselineStd / counters.mdlGateChecked
        : 0,
    };
  }
}

export class NoOpMonitor implements ILZSMonitor {
  readonly _mode: "disabled" | "performance-only" | "extended" = "disabled";

  // Current counter values
  private _counters: Record<CounterType, number> = {
    bytesIn: 0,
    bytesOut: 0,
    candidatesStarted: 0,
    mdlGateChecked: 0,
    mdlGatePassed: 0,
    mdlGateFailed: 0,
    cacheGateChecked: 0,
    cacheGatePassed: 0,
    cacheGateFailed: 0,
    trieGateChecked: 0,
    trieGatePassed: 0,
    trieGateFailed: 0,
    tokensEmitted: 0,
    emissionHadLongerOptions: 0,
    emissionSumChildDegree: 0,
    mdlSumSurprisal: 0,
    mdlSumBaselineMean: 0,
    mdlSumBaselineStd: 0,
  };

  increment(_counter: CounterType, _amount = 1): void {
    // No-op for maximum performance
  }

  getCounters(): Record<CounterType, number> {
    return { ...this._counters };
  }

  reset(): void {
    // No-op
  }

  flush(): void {
    // No-op
  }

  start(): void {
    // No-op
  }

  get stats(): IStats | null {
    return null;
  }
}
