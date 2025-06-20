/**
 * Global registry for process monitors
 * Allows aggregating metrics across all active connections
 */
class MonitorRegistry {
  private monitors = new Map<string, ProcessMonitor>();

  register(sessionId: string, monitor: ProcessMonitor): void {
    this.monitors.set(sessionId, monitor);
  }

  unregister(sessionId: string): void {
    this.monitors.delete(sessionId);
  }

  getAggregatedMetrics(): AggregatedMetrics {
    const monitors = Array.from(this.monitors.values());

    if (monitors.length === 0) {
      return {
        activeConnections: 0,
        totalTransforms: 0,
        totalMemgraphOps: 0,
        avgTransformDuration: 0,
        avgMemgraphDuration: 0,
        overallMergeRate: 0,
        bottlenecks: [],
      };
    }

    let totalTransforms = 0;
    let totalMemgraphOps = 0;
    let totalTransformTime = 0;
    let totalMemgraphTime = 0;
    let totalInputs = 0;
    let totalMerges = 0;
    const bottlenecks: string[] = [];

    for (const monitor of monitors) {
      const metrics = monitor.getMetrics();

      totalTransforms += metrics.transform.count;
      totalMemgraphOps += metrics.memgraph.count;
      totalTransformTime +=
        metrics.transform.meanDuration * metrics.transform.count;
      totalMemgraphTime +=
        metrics.memgraph.meanDuration * metrics.memgraph.count;
      totalInputs += metrics.mergeRate.inputCount;
      totalMerges += metrics.mergeRate.mergeCount;

      const bottleneck = monitor.getBottleneckIndicator();
      if (bottleneck) {
        bottlenecks.push(bottleneck);
      }
    }

    return {
      activeConnections: monitors.length,
      totalTransforms,
      totalMemgraphOps,
      avgTransformDuration:
        totalTransforms > 0 ? totalTransformTime / totalTransforms : 0,
      avgMemgraphDuration:
        totalMemgraphOps > 0 ? totalMemgraphTime / totalMemgraphOps : 0,
      overallMergeRate: totalInputs > 0 ? totalMerges / totalInputs : 0,
      bottlenecks,
    };
  }

  getAllMetrics(): { [sessionId: string]: ProcessMetrics } {
    const result: { [sessionId: string]: ProcessMetrics } = {};

    for (const [sessionId, monitor] of this.monitors) {
      result[sessionId] = monitor.getMetrics();
    }

    return result;
  }
}

// Global singleton instance
export const monitorRegistry = new MonitorRegistry();

/**
 * Minimal process monitoring using online algorithms
 * Tracks token lifecycle performance without blocking
 */
export class ProcessMonitor {
  // Transform timing (online mean and variance)
  private transformCount = 0;
  private transformMean = 0;
  private transformM2 = 0;

  // Merge rate tracking
  private inputCount = 0;
  private mergeCount = 0;

  // Memgraph timing (online mean and variance)
  private memgraphCount = 0;
  private memgraphMean = 0;
  private memgraphM2 = 0;

  // Sliding window for recent performance (circular buffer)
  private readonly windowSize = 100;
  private transformWindow: number[] = [];
  private memgraphWindow: number[] = [];
  private windowIndex = 0;

  /**
   * Record the start of a transform operation
   */
  startTransform(): number {
    return performance.now();
  }

  /**
   * Record the completion of a transform operation
   * @param startTime - The start time from startTransform()
   * @param hadOutput - Whether the transform produced a non-null token
   */
  endTransform(startTime: number, hadOutput: boolean): void {
    const duration = performance.now() - startTime;

    // Update transform timing using Welford's online algorithm
    this.transformCount++;
    const delta = duration - this.transformMean;
    this.transformMean += delta / this.transformCount;
    const delta2 = duration - this.transformMean;
    this.transformM2 += delta * delta2;

    // Update sliding window
    if (this.transformWindow.length < this.windowSize) {
      this.transformWindow.push(duration);
    } else {
      this.transformWindow[this.windowIndex % this.windowSize] = duration;
    }

    // Update merge rate
    this.inputCount++;
    if (hadOutput) {
      this.mergeCount++;
    }
  }

  /**
   * Record the start of a memgraph operation
   */
  startMemgraph(): number {
    return performance.now();
  }

  /**
   * Record the completion of a memgraph operation
   */
  endMemgraph(startTime: number): void {
    const duration = performance.now() - startTime;

    // Update memgraph timing using Welford's online algorithm
    this.memgraphCount++;
    const delta = duration - this.memgraphMean;
    this.memgraphMean += delta / this.memgraphCount;
    const delta2 = duration - this.memgraphMean;
    this.memgraphM2 += delta * delta2;

    // Update sliding window
    if (this.memgraphWindow.length < this.windowSize) {
      this.memgraphWindow.push(duration);
    } else {
      this.memgraphWindow[this.windowIndex % this.windowSize] = duration;
    }

    this.windowIndex++;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): ProcessMetrics {
    const transformVariance =
      this.transformCount > 1
        ? this.transformM2 / (this.transformCount - 1)
        : 0;
    const memgraphVariance =
      this.memgraphCount > 1 ? this.memgraphM2 / (this.memgraphCount - 1) : 0;

    return {
      transform: {
        count: this.transformCount,
        meanDuration: this.transformMean,
        stdDev: Math.sqrt(transformVariance),
        recentMean: this.calculateRecentMean(this.transformWindow),
      },
      memgraph: {
        count: this.memgraphCount,
        meanDuration: this.memgraphMean,
        stdDev: Math.sqrt(memgraphVariance),
        recentMean: this.calculateRecentMean(this.memgraphWindow),
      },
      mergeRate: {
        inputCount: this.inputCount,
        mergeCount: this.mergeCount,
        ratio: this.inputCount > 0 ? this.mergeCount / this.inputCount : 0,
      },
    };
  }

  /**
   * Calculate mean of recent samples in sliding window
   */
  private calculateRecentMean(window: number[]): number {
    if (window.length === 0) return 0;
    return window.reduce((sum, val) => sum + val, 0) / window.length;
  }

  /**
   * Check if system is showing signs of bottleneck
   * Returns bottleneck type or null if performance is normal
   */
  getBottleneckIndicator(): BottleneckType | null {
    if (this.transformCount < 10 || this.memgraphCount < 10) {
      return null; // Not enough data
    }

    const metrics = this.getMetrics();

    // Check if memgraph is significantly slower than transform
    if (metrics.memgraph.meanDuration > metrics.transform.meanDuration * 3) {
      return "memgraph";
    }

    // Check if transform is taking unusually long
    if (metrics.transform.meanDuration > 10) {
      // 10ms threshold
      return "transform";
    }

    // Check if merge rate is very low (indicating potential memory pressure)
    if (metrics.mergeRate.ratio < 0.1 && this.inputCount > 100) {
      return "merge_rate";
    }

    return null;
  }

  /**
   * Reset all metrics (useful for testing or new sessions)
   */
  reset(): void {
    this.transformCount = 0;
    this.transformMean = 0;
    this.transformM2 = 0;
    this.inputCount = 0;
    this.mergeCount = 0;
    this.memgraphCount = 0;
    this.memgraphMean = 0;
    this.memgraphM2 = 0;
    this.transformWindow = [];
    this.memgraphWindow = [];
    this.windowIndex = 0;
  }
}

export interface ProcessMetrics {
  transform: {
    count: number;
    meanDuration: number;
    stdDev: number;
    recentMean: number;
  };
  memgraph: {
    count: number;
    meanDuration: number;
    stdDev: number;
    recentMean: number;
  };
  mergeRate: {
    inputCount: number;
    mergeCount: number;
    ratio: number;
  };
}

export interface AggregatedMetrics {
  activeConnections: number;
  totalTransforms: number;
  totalMemgraphOps: number;
  avgTransformDuration: number;
  avgMemgraphDuration: number;
  overallMergeRate: number;
  bottlenecks: string[];
}

export type BottleneckType = "transform" | "memgraph" | "merge_rate";
