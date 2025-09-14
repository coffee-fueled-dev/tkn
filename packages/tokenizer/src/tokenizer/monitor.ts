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

  constructor(config: ITokenizerMonitorConfig) {
    this._config = config;
    this._mode = config.mode ?? "disabled";
  }

  start(): void {
    if (!this._start) this._start = performance.now();
  }

  increment(counter: TKCounter, amount = 1): void {
    if (this._mode === "disabled") return;
    this._counters[counter] += amount;
  }

  reset(): void {
    (Object.keys(this._counters) as TKCounter[]).forEach(
      (k) => (this._counters[k] = 0)
    );
    this._start = null;
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

    return {
      durationMS,
      codepointsIn: c.codepointsIn,
      tokensOut: c.tokensOut,
      rateTokPerSec,
      prefixLookups: c.prefixLookups,
      transitionLookups: c.transitionLookups,
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
