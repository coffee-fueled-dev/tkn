export type TKCounter =
  | "codepointsIn"
  | "tokensOut"
  | "prefixLookups"
  | "transitionLookups";

export interface ITokenizerStats {
  durationMS: number;
  codepointsIn: number;
  tokensOut: number;
  rateTokPerSec: number;
  prefixLookups: number;
  transitionLookups: number;
  lastInference: Omit<ITokenizerStats, "lastInference"> | null;
}

export interface ITokenizerMonitor {
  readonly _config: ITokenizerMonitorConfig;
  readonly _mode: "disabled" | "performance-only" | "extended";
  start(): void;
  startInference(): void;
  endInference(): void;
  increment(counter: TKCounter, amount?: number): void;
  reset(): void;
  flush(): void;
  getCounters(): Record<TKCounter, number>;
  stats: ITokenizerStats | null;
  config: ITokenizerMonitorConfig;
}

export interface ITokenizerMonitorConfig {
  mode?: "disabled" | "performance-only" | "extended";
}
