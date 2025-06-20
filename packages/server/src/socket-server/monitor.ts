import type { BatchItem } from "./parse-to-batch";

/**
 * Simplified process monitor that tracks bytes, counts, and rates
 */
export class ProcessMonitor {
  private totalBytesProcessed = 0;
  private totalItemsIncoming = 0;
  private totalTokensOutgoing = 0;

  // Rate tracking with sliding windows
  private readonly windowSize = 100; // Track rates over last 100 items
  private ingestionTimestamps: number[] = [];
  private emissionTimestamps: number[] = [];
  private windowIndex = 0;

  incrementItemsIngested(): void {
    this.totalItemsIncoming++;

    // Record timestamp for rate calculation
    const now = performance.now();
    if (this.ingestionTimestamps.length < this.windowSize) {
      this.ingestionTimestamps.push(now);
    } else {
      this.ingestionTimestamps[this.windowIndex % this.windowSize] = now;
    }
  }

  incrementTokensEmitted(): void {
    this.totalTokensOutgoing++;

    // Record timestamp for rate calculation
    const now = performance.now();
    if (this.emissionTimestamps.length < this.windowSize) {
      this.emissionTimestamps.push(now);
    } else {
      this.emissionTimestamps[this.windowIndex % this.windowSize] = now;
    }

    this.windowIndex++;
  }

  /**
   * Calculate items per second based on sliding window
   */
  private calculateIngestionRate(): number {
    if (this.ingestionTimestamps.length < 2) return 0;

    const timestamps = [...this.ingestionTimestamps].sort((a, b) => a - b);
    const timeSpanMs = timestamps[timestamps.length - 1] - timestamps[0];
    const timeSpanSec = timeSpanMs / 1000;

    return timeSpanSec > 0 ? timestamps.length / timeSpanSec : 0;
  }

  /**
   * Calculate tokens per second based on sliding window
   */
  private calculateEmissionRate(): number {
    if (this.emissionTimestamps.length < 2) return 0;

    const timestamps = [...this.emissionTimestamps].sort((a, b) => a - b);
    const timeSpanMs = timestamps[timestamps.length - 1] - timestamps[0];
    const timeSpanSec = timeSpanMs / 1000;

    return timeSpanSec > 0 ? timestamps.length / timeSpanSec : 0;
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
      mergeRatio:
        this.totalItemsIncoming > 0
          ? (this.totalItemsIncoming - this.totalTokensOutgoing) /
            this.totalItemsIncoming
          : 0,
      compressionRatio:
        this.totalBytesProcessed > 0
          ? this.totalBytesProcessed / this.totalTokensOutgoing
          : 0,
      ingestionRatePerSec: this.calculateIngestionRate(),
      emissionRatePerSec: this.calculateEmissionRate(),
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
      `Merge ratio: ${(metrics.mergeRatio * 100).toFixed(1)}%, ` +
      `Compression ratio: ${(metrics.compressionRatio * 100).toFixed(1)}%, ` +
      `Ingestion: ${metrics.ingestionRatePerSec.toFixed(1)}/sec, ` +
      `Emission: ${metrics.emissionRatePerSec.toFixed(1)}/sec`
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
    this.ingestionTimestamps = [];
    this.emissionTimestamps = [];
    this.windowIndex = 0;
  }
}

export interface ProcessMetrics {
  totalBytes: number;
  totalItemsIncoming: number;
  totalTokensOutgoing: number;
  mergeRatio: number;
  compressionRatio: number;
  ingestionRatePerSec: number;
  emissionRatePerSec: number;
}
