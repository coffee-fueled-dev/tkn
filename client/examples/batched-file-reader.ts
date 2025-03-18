/**
 * BatchedFileReader - A class that reads files in controlled-size batches.
 * This class only focuses on reading and creating batches, without interval-based output control.
 */
export class BatchedFileReader {
  private file: any; // File object from Bun
  private batchSize: number;
  private onBatch: (batch: string, index: number) => void;
  private onComplete: () => void;
  private onError: (error: Error) => void;

  private isReading: boolean = false;
  private buffer: string = "";
  private batchIndex: number = 0;

  /**
   * @param filePath - Path to the file to read
   * @param options - Configuration options
   */
  constructor(
    filePath: string,
    options: {
      batchSize?: number;
      onBatch?: (batch: string, index: number) => void;
      onComplete?: () => void;
      onError?: (error: Error) => void;
    } = {}
  ) {
    this.file = Bun.file(filePath);
    this.batchSize = options.batchSize || 1024;
    this.onBatch =
      options.onBatch ||
      ((batch, index) =>
        console.log(
          `Batch ${index} (${batch.length} chars):`,
          batch.substring(0, 50) + "..."
        ));
    this.onComplete =
      options.onComplete || (() => console.log("Reading complete"));
    this.onError =
      options.onError || ((err) => console.error("Error reading file:", err));
  }

  /**
   * Start reading the file in batches
   */
  async start(): Promise<void> {
    if (this.isReading) return;
    this.isReading = true;

    try {
      await this.readFile();
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.stop();
    }
  }

  /**
   * Stop reading
   */
  stop(): void {
    this.isReading = false;
  }

  /**
   * Internal method to read the file and create batches
   */
  private async readFile(): Promise<void> {
    const reader = this.file.stream().getReader();
    const decoder = new TextDecoder();

    try {
      while (this.isReading) {
        const { done, value } = await reader.read();

        if (done) {
          // Process any remaining data in the buffer
          if (this.buffer.length > 0) {
            this.processBatch(this.buffer);
          }

          this.isReading = false;
          this.onComplete();
          break;
        }

        // Convert the Uint8Array to a string and add to our buffer
        this.buffer += decoder.decode(value, { stream: true });

        // Process complete batches
        while (this.buffer.length >= this.batchSize) {
          const batch = this.buffer.slice(0, this.batchSize);
          this.buffer = this.buffer.slice(this.batchSize);
          this.processBatch(batch);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process a batch by calling the onBatch handler
   */
  private processBatch(batch: string): void {
    this.onBatch(batch, this.batchIndex++);
  }
}
