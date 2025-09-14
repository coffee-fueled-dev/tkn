/**
 * Throughput metrics for LZS performance
 */
export interface IStats {
  durationMS: number;
  bytesIn: number;
  bytesOut: number;
  timesNull: number;
  timesExtended: number;
  timesDeferred: number;
  opportunitiesUnknown: number;
  opportunitiesUntrusted: number;
  opportunitiesTotal: number;
  hadLongerUnknown: number;
  hadLongerUntrusted: number;
  hadLongerTotal: number;
  missedExtensionRate: number;
  missedExtensionRateUnknown: number;
  missedExtensionRateUntrusted: number;
  avgChildDegreeUnknown: number;
  avgChildDegreeUntrusted: number;
  rateMBs: number;
  // MDL statistics
  mdlChecked: number;
  mdlExtended: number;
  mdlEmitted: number;
  avgMDLLogP: number;
  // EWMA baseline tracking
  mdlBaselineMean: number;
  mdlBaselineStd: number;
}

/**
 * Counter types for performance monitoring
 */
export type CounterType =
  | "bytesIn"
  | "bytesOut"
  | "timesNull"
  | "timesExtended"
  | "timesDeferred"
  | "oppUnknown"
  | "oppUntrusted"
  | "hadLongerUnknown"
  | "hadLongerUntrusted"
  | "childDegreeSumUnknown"
  | "childDegreeSumUntrusted"
  | "mdlChecked"
  | "mdlExtended"
  | "mdlEmitted"
  | "mdlSumLogP"
  | "mdlBaselineMeanSum"
  | "mdlBaselineStdSum";

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
    timesNull: 0,
    timesExtended: 0,
    timesDeferred: 0,
    oppUnknown: 0,
    oppUntrusted: 0,
    hadLongerUnknown: 0,
    hadLongerUntrusted: 0,
    childDegreeSumUnknown: 0,
    childDegreeSumUntrusted: 0,
    mdlChecked: 0,
    mdlExtended: 0,
    mdlEmitted: 0,
    mdlSumLogP: 0,
    mdlBaselineMeanSum: 0,
    mdlBaselineStdSum: 0,
  };

  // Batched pending updates
  private _pending: Record<CounterType, number> = {
    bytesIn: 0,
    bytesOut: 0,
    timesNull: 0,
    timesExtended: 0,
    timesDeferred: 0,
    oppUnknown: 0,
    oppUntrusted: 0,
    hadLongerUnknown: 0,
    hadLongerUntrusted: 0,
    childDegreeSumUnknown: 0,
    childDegreeSumUntrusted: 0,
    mdlChecked: 0,
    mdlExtended: 0,
    mdlEmitted: 0,
    mdlSumLogP: 0,
    mdlBaselineMeanSum: 0,
    mdlBaselineStdSum: 0,
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
    // Always track bytesIn/bytesOut for basic performance metrics
    const isBasicCounter = counter === "bytesIn" || counter === "bytesOut";
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

    const oppTotal = counters.oppUnknown + counters.oppUntrusted;
    const hadLongerTotal =
      counters.hadLongerUnknown + counters.hadLongerUntrusted;

    return {
      durationMS,
      bytesIn: counters.bytesIn,
      bytesOut: counters.bytesOut,

      timesNull: counters.timesNull,
      timesExtended: counters.timesExtended,
      timesDeferred: counters.timesDeferred,

      // New: opportunities & missed-extensions metrics
      opportunitiesUnknown: counters.oppUnknown,
      opportunitiesUntrusted: counters.oppUntrusted,
      opportunitiesTotal: oppTotal,

      hadLongerUnknown: counters.hadLongerUnknown,
      hadLongerUntrusted: counters.hadLongerUntrusted,
      hadLongerTotal: hadLongerTotal,

      // Helpful rates
      missedExtensionRate: oppTotal ? hadLongerTotal / oppTotal : 0,
      missedExtensionRateUnknown: counters.oppUnknown
        ? counters.hadLongerUnknown / counters.oppUnknown
        : 0,
      missedExtensionRateUntrusted: counters.oppUntrusted
        ? counters.hadLongerUntrusted / counters.oppUntrusted
        : 0,

      // Diagnostics: average child degree at emission points
      avgChildDegreeUnknown: counters.oppUnknown
        ? counters.childDegreeSumUnknown / counters.oppUnknown
        : 0,
      avgChildDegreeUntrusted: counters.oppUntrusted
        ? counters.childDegreeSumUntrusted / counters.oppUntrusted
        : 0,

      rateMBs: (counters.bytesOut * 0.000001) / (durationMS / 1000),

      // MDL statistics
      mdlChecked: counters.mdlChecked,
      mdlExtended: counters.mdlExtended,
      mdlEmitted: counters.mdlEmitted,
      avgMDLLogP: counters.mdlChecked
        ? counters.mdlSumLogP / counters.mdlChecked
        : 0,
      // EWMA baseline tracking
      mdlBaselineMean: counters.mdlChecked
        ? counters.mdlBaselineMeanSum / counters.mdlChecked
        : 0,
      mdlBaselineStd: counters.mdlChecked
        ? counters.mdlBaselineStdSum / counters.mdlChecked
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
    timesNull: 0,
    timesExtended: 0,
    timesDeferred: 0,
    oppUnknown: 0,
    oppUntrusted: 0,
    hadLongerUnknown: 0,
    hadLongerUntrusted: 0,
    childDegreeSumUnknown: 0,
    childDegreeSumUntrusted: 0,
    mdlChecked: 0,
    mdlExtended: 0,
    mdlEmitted: 0,
    mdlSumLogP: 0,
    mdlBaselineMeanSum: 0,
    mdlBaselineStdSum: 0,
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
