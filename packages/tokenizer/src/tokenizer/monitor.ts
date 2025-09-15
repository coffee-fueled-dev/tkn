import type {
  TKCounter,
  ITokenizerStats,
  ITokenizerMonitor,
  ITokenizerMonitorConfig,
} from "./monitor.domain";

export class TokenizerMonitor implements ITokenizerMonitor {
  readonly _config: ITokenizerMonitorConfig;
  readonly _mode: "disabled" | "performance-only" | "extended";
  private _start: number | null = null;
  private _counters: Record<TKCounter, number> = {
    codepointsIn: 0,
    tokensOut: 0,
    prefixLookups: 0,
    transitionLookups: 0,
  };
  private _lastInferenceStart: number | null = null;
  private _lastInferenceCounters: Record<TKCounter, number> = {
    codepointsIn: 0,
    tokensOut: 0,
    prefixLookups: 0,
    transitionLookups: 0,
  };

  constructor(config: ITokenizerMonitorConfig) {
    this._config = config;
    this._mode = config.mode ?? "disabled";
  }

  start(): void {
    if (!this._start) this._start = performance.now();
  }

  startInference(): void {
    if (this._mode === "disabled") return;
    this._lastInferenceStart = performance.now();
    // Reset last inference counters
    (Object.keys(this._lastInferenceCounters) as TKCounter[]).forEach(
      (k) => (this._lastInferenceCounters[k] = 0)
    );
  }

  endInference(): void {
    // This method exists for explicit inference end marking if needed
    // The stats getter will calculate based on current state
  }

  increment(counter: TKCounter, amount = 1): void {
    if (this._mode === "disabled") return;
    this._counters[counter] += amount;
    // Also track for last inference if it's active
    if (this._lastInferenceStart !== null) {
      this._lastInferenceCounters[counter] += amount;
    }
  }

  reset(): void {
    (Object.keys(this._counters) as TKCounter[]).forEach(
      (k) => (this._counters[k] = 0)
    );
    (Object.keys(this._lastInferenceCounters) as TKCounter[]).forEach(
      (k) => (this._lastInferenceCounters[k] = 0)
    );
    this._start = null;
    this._lastInferenceStart = null;
  }

  flush(): void {
    // no-op (kept for parity with LZS monitor API)
  }

  getCounters(): Record<TKCounter, number> {
    return { ...this._counters };
  }

  get stats(): ITokenizerStats | null {
    if (!this._start) return null;
    const durationMS = performance.now() - this._start;
    const c = this.getCounters();
    const rateTokPerSec =
      durationMS > 0 ? (c.tokensOut / durationMS) * 1000 : 0;

    let lastInference: Omit<ITokenizerStats, "lastInference"> | null = null;
    if (this._lastInferenceStart !== null) {
      const lastDurationMS = performance.now() - this._lastInferenceStart;
      const lastRateTokPerSec =
        lastDurationMS > 0
          ? (this._lastInferenceCounters.tokensOut / lastDurationMS) * 1000
          : 0;

      lastInference = {
        durationMS: Number(lastDurationMS.toFixed(3)),
        codepointsIn: this._lastInferenceCounters.codepointsIn,
        tokensOut: this._lastInferenceCounters.tokensOut,
        rateTokPerSec: Number(lastRateTokPerSec.toFixed(0)),
        prefixLookups: this._lastInferenceCounters.prefixLookups,
        transitionLookups: this._lastInferenceCounters.transitionLookups,
      };
    }

    return {
      durationMS: Number(durationMS.toFixed(3)),
      codepointsIn: c.codepointsIn,
      tokensOut: c.tokensOut,
      rateTokPerSec: Number(rateTokPerSec.toFixed(0)),
      prefixLookups: c.prefixLookups,
      transitionLookups: c.transitionLookups,
      lastInference,
    };
  }
  get config(): ITokenizerMonitorConfig {
    return this._config;
  }
}

export class NoOpTokenizerMonitor implements ITokenizerMonitor {
  readonly _config: ITokenizerMonitorConfig = {
    mode: "disabled",
  };
  readonly _mode = "disabled" as const;
  start() {}
  startInference() {}
  endInference() {}
  increment(_c: TKCounter, _a = 1) {}
  reset() {}
  flush() {}
  getCounters(): Record<TKCounter, number> {
    return {
      codepointsIn: 0,
      tokensOut: 0,
      prefixLookups: 0,
      transitionLookups: 0,
    };
  }
  get stats(): ITokenizerStats | null {
    return null;
  }
  get config(): ITokenizerMonitorConfig {
    return this._config;
  }
}
