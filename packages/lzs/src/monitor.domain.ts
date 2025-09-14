/**
 * Counter types for LZS performance monitoring
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
 * Interface for LZS performance monitoring with async counter updates
 */
export interface ILZSMonitor {
  /**
   * Configuration
   */
  readonly _config: ILZSMonitorConfig;
  /**
   * Stats mode
   */
  readonly _mode: "disabled" | "performance-only" | "extended";
  /**
   * Batch size for counter updates
   */
  readonly _batchSize: number;

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

  /**
   * Get the configuration used for instantiation
   */
  config: ILZSMonitorConfig;
}

export interface ILZSMonitorConfig {
  mode?: "disabled" | "performance-only" | "extended";
  batchSize?: number;
}
