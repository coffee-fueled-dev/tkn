/**
 * BatchEmitter - A class that controls when batches are emitted,
 * with support for both immediate and interval-based output.
 */
export class BatchEmitter {
  private intervalMs: number | null;
  private onBatch: (batch: string, index: number) => void;
  private onComplete: () => void;

  private batchQueue: string[] = [];
  private intervalId: any = null;
  private batchIndex: number = 0;
  private isProcessing: boolean = false;

  /**
   * @param options - Configuration options
   */
  constructor(
    options: {
      intervalMs?: number | null;
      onBatch?: (batch: string, index: number) => void;
      onComplete?: () => void;
    } = {}
  ) {
    this.intervalMs = options.intervalMs ?? null;
    this.onBatch =
      options.onBatch ||
      ((batch, index) =>
        console.log(
          `Batch ${index} (${batch.length} chars):`,
          batch.substring(0, 50) + "..."
        ));
    this.onComplete =
      options.onComplete || (() => console.log("All batches emitted"));
  }

  /**
   * Start the emitter, setting up intervals if needed
   */
  start(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    // Set up interval processing if configured
    if (this.intervalMs !== null) {
      this.intervalId = setInterval(
        () => this.processNextBatch(),
        this.intervalMs
      );
    }
  }

  /**
   * Stop the emitter and clear any intervals
   */
  stop(): void {
    this.isProcessing = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Add a batch to be emitted
   */
  addBatch(batch: string): void {
    if (!this.isProcessing) {
      this.start();
    }

    if (this.intervalMs === null) {
      // If not using intervals, process immediately
      this.onBatch(batch, this.batchIndex++);
    } else {
      // Otherwise add to queue for interval processing
      this.batchQueue.push(batch);
    }
  }

  /**
   * Signal that all batches have been added
   */
  complete(): void {
    if (this.intervalMs === null || this.batchQueue.length === 0) {
      // If not using intervals or queue is empty, complete immediately
      this.stop();
      this.onComplete();
    } else {
      // Otherwise, wait for queue to empty before completing
      const checkQueueEmpty = () => {
        if (this.batchQueue.length === 0) {
          this.stop();
          this.onComplete();
        } else {
          setTimeout(checkQueueEmpty, this.intervalMs || 10);
        }
      };

      setTimeout(checkQueueEmpty, this.intervalMs || 10);
    }
  }

  /**
   * Process the next batch in the queue
   */
  private processNextBatch(): void {
    if (this.batchQueue.length > 0) {
      const batch = this.batchQueue.shift()!;
      this.onBatch(batch, this.batchIndex++);
    } else if (!this.isProcessing && this.intervalId !== null) {
      // If not processing any more and no more batches, clear the interval
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
