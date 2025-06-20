import type { BatchItem } from "./parse-to-batch";

/**
 * Simplified process monitor that tracks bytes, counts, and rates
 */
export class ProcessMonitor {
  private totalBytesProcessed = 0;
  private totalItemsIncoming = 0;
  private totalTokensOutgoing = 0;
  private totalTransforms = 0;
  private totalDbTransactions = 0;

  // Processing time tracking for capacity measurements
  private sessionStartTime = 0;
  private totalTransformProcessingTime = 0; // Accumulated time spent in miner
  private totalDbProcessingTime = 0; // Accumulated time spent in database
  private transformOperations = 0;
  private dbOperations = 0;

  // Current operation timing
  private currentTransformStart = 0;
  private currentDbBatchStart = 0;

  constructor() {
    this.sessionStartTime = performance.now();
  }

  incrementItemsIngested(): void {
    this.totalItemsIncoming++;
  }

  incrementTokensEmitted(): void {
    this.totalTokensOutgoing++;
  }

  incrementTransforms(): void {
    this.totalTransforms++;
  }

  incrementDbTransactions(): void {
    this.totalDbTransactions++;
  }

  /**
   * Record bytes processed
   * @param inputSizeBytes - Size of the input data in bytes
   */
  countBytes(item: BatchItem): void {
    const inputSizeBytes =
      typeof item.data === "string"
        ? new TextEncoder().encode(item.data).length
        : item.data.length;
    this.totalBytesProcessed += inputSizeBytes;
  }

  /**
   * Get current metrics - bytes, counts, and rates
   */
  getMetrics(): ProcessMetrics {
    return {
      totalBytes: this.totalBytesProcessed,
      totalItemsIncoming: this.totalItemsIncoming,
      totalTokensOutgoing: this.totalTokensOutgoing,
      totalTransforms: this.totalTransforms,
      totalDbTransactions: this.totalDbTransactions,
      mergeRatio:
        this.totalItemsIncoming > 0
          ? (this.totalItemsIncoming - this.totalTokensOutgoing) /
            this.totalItemsIncoming
          : 0,
      compressionRatio:
        this.totalItemsIncoming > 0
          ? this.totalTokensOutgoing / this.totalItemsIncoming
          : 0,
      bytesPerToken:
        this.totalTokensOutgoing > 0
          ? this.totalBytesProcessed / this.totalTokensOutgoing
          : 0,
      ingestionRatePerSec: this.calculateIngestionRate(),
      emissionRatePerSec: this.calculateEmissionRate(),
      transformRatePerSec: this.calculateTransformRate(),
      dbTransactionRatePerSec: this.calculateDbTransactionRate(),
      transformCapacityPerSec: this.calculateTransformCapacity(),
      dbCapacityPerSec: this.calculateDbCapacity(),
    };
  }

  /**
   * Get a formatted console message for logging
   */
  getConsoleMessage(): string {
    const metrics = this.getMetrics();
    return (
      `Total: ${this.formatBytes(metrics.totalBytes)}, ` +
      `Items: ${metrics.totalItemsIncoming}, ` +
      `Tokens: ${metrics.totalTokensOutgoing}, ` +
      `Transforms: ${metrics.totalTransforms}, ` +
      `DB Persisted: ${metrics.totalDbTransactions}, ` +
      `Merge ratio: ${(metrics.mergeRatio * 100).toFixed(1)}%, ` +
      `Compression ratio: ${(metrics.compressionRatio * 100).toFixed(1)}%, ` +
      `Bytes/token: ${metrics.bytesPerToken.toFixed(1)}, ` +
      `Rates: ${metrics.ingestionRatePerSec.toFixed(1)} items/sec, ` +
      `${metrics.emissionRatePerSec.toFixed(1)} tkns/sec, ` +
      `Capacity: Transform ${metrics.transformCapacityPerSec.toFixed(
        1
      )} items/sec, ` +
      `DB ${metrics.dbCapacityPerSec.toFixed(1)} tkns/sec`
    );
  }

  /**
   * Helper function to format bytes
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.totalBytesProcessed = 0;
    this.totalItemsIncoming = 0;
    this.totalTokensOutgoing = 0;
    this.totalTransforms = 0;
    this.totalDbTransactions = 0;
    this.sessionStartTime = performance.now();
    this.totalTransformProcessingTime = 0;
    this.totalDbProcessingTime = 0;
    this.transformOperations = 0;
    this.dbOperations = 0;
    this.currentTransformStart = 0;
    this.currentDbBatchStart = 0;
  }

  /**
   * Calculate items per second based on simplified sampling
   */
  private calculateIngestionRate(): number {
    const now = performance.now();
    const timeSpanMs = now - this.sessionStartTime;
    const timeSpanSec = timeSpanMs / 1000;
    return timeSpanSec > 0 ? this.totalItemsIncoming / timeSpanSec : 0;
  }

  /**
   * Calculate tokens per second based on simplified sampling
   */
  private calculateEmissionRate(): number {
    const now = performance.now();
    const timeSpanMs = now - this.sessionStartTime;
    const timeSpanSec = timeSpanMs / 1000;
    return timeSpanSec > 0 ? this.totalTokensOutgoing / timeSpanSec : 0;
  }

  /**
   * Calculate transforms per second based on simplified sampling
   */
  private calculateTransformRate(): number {
    const now = performance.now();
    const timeSpanMs = now - this.sessionStartTime;
    const timeSpanSec = timeSpanMs / 1000;
    return timeSpanSec > 0 ? this.totalTransforms / timeSpanSec : 0;
  }

  /**
   * Calculate db transactions per second based on simplified sampling
   */
  private calculateDbTransactionRate(): number {
    const now = performance.now();
    const timeSpanMs = now - this.sessionStartTime;
    const timeSpanSec = timeSpanMs / 1000;
    return timeSpanSec > 0 ? this.totalDbTransactions / timeSpanSec : 0;
  }

  /**
   * Start timing a transform operation
   */
  startTransformTiming(): void {
    this.currentTransformStart = performance.now();
  }

  /**
   * End timing a transform operation
   */
  endTransformTiming(): void {
    if (this.currentTransformStart > 0) {
      const duration = performance.now() - this.currentTransformStart;
      this.totalTransformProcessingTime += duration;
      this.transformOperations++;
      this.currentTransformStart = 0;
    }
  }

  /**
   * Start timing a database batch operation
   */
  startDbBatchTiming(): void {
    this.currentDbBatchStart = performance.now();
  }

  /**
   * End timing a database batch operation
   */
  endDbBatchTiming(): void {
    if (this.currentDbBatchStart > 0) {
      const duration = performance.now() - this.currentDbBatchStart;
      this.totalDbProcessingTime += duration;
      this.dbOperations++;
      this.currentDbBatchStart = 0;
    }
  }

  /**
   * Calculate actual transform capacity (items/sec when actively processing)
   */
  private calculateTransformCapacity(): number {
    if (this.totalTransformProcessingTime === 0) return 0;
    const timeSpanSec = this.totalTransformProcessingTime / 1000;
    return timeSpanSec > 0 ? this.totalTransforms / timeSpanSec : 0;
  }

  /**
   * Calculate actual database capacity (tokens/sec when actively processing)
   */
  private calculateDbCapacity(): number {
    if (this.totalDbProcessingTime === 0) return 0;
    const timeSpanSec = this.totalDbProcessingTime / 1000;
    return timeSpanSec > 0 ? this.totalDbTransactions / timeSpanSec : 0;
  }
}

export interface ProcessMetrics {
  totalBytes: number;
  totalItemsIncoming: number;
  totalTokensOutgoing: number;
  totalTransforms: number;
  totalDbTransactions: number;
  mergeRatio: number;
  compressionRatio: number;
  bytesPerToken: number;
  ingestionRatePerSec: number;
  emissionRatePerSec: number;
  transformRatePerSec: number;
  dbTransactionRatePerSec: number;
  transformCapacityPerSec: number;
  dbCapacityPerSec: number;
}
