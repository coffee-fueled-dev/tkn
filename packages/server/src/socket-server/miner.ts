import { LRUCache } from "lru-cache";

export interface OutputToken {
  buffer: Uint8Array;
  value: string;
  sessionIndex: number;
}

export type TknMinerCallback = (
  error: Error | null,
  data: OutputToken | null
) => Promise<void>;

export type TknMinerResult =
  | {
      error: null;
      data: OutputToken;
    }
  | {
      error: Error;
      data: null;
    }
  | {
      error: null;
      data: null;
    };

export class TknMiner {
  private cache: LRUCache<number, boolean>;
  private windowBuffer: Uint8Array;
  private windowSize: number = 0;
  private windowStart: number = 0; // Start index for circular buffer
  private maxWindowSize: number;
  private sessionIndex: number = 0;
  private textDecoder: TextDecoder;

  // Rolling hash state - optimized for performance
  private rollingHash: number = 0;
  private previousHash: number = 0; // Cache previous window hash
  private readonly BASE: number = 257; // Optimized prime base (larger prime for better distribution)
  private basePowers: Uint32Array; // Use Uint32Array for better performance

  constructor(cache: LRUCache<number, boolean>, maxWindowSize: number = 1024) {
    this.cache = cache;
    this.maxWindowSize = maxWindowSize;
    this.windowBuffer = new Uint8Array(maxWindowSize);
    this.textDecoder = new TextDecoder("utf-8");

    // Precompute powers of BASE for rolling hash using Uint32Array
    this.basePowers = new Uint32Array(maxWindowSize);
    this.basePowers[0] = 1;
    for (let i = 1; i < maxWindowSize; i++) {
      this.basePowers[i] = (this.basePowers[i - 1] * this.BASE) >>> 0;
    }
  }

  /**
   * Add a byte to the rolling hash (when window is growing)
   * Inlined for performance - no function call overhead
   */
  private addByteToHash(byte: number): void {
    this.rollingHash = (this.rollingHash * this.BASE + byte) >>> 0;
  }

  /**
   * Update rolling hash when sliding window (remove old byte, add new byte)
   * Optimized with cached previous hash and bitwise operations
   */
  private updateRollingHash(oldByte: number, newByte: number): void {
    // Cache the previous window hash before updating
    this.previousHash = (this.rollingHash - newByte) >>> 0;

    // Remove the contribution of the old byte using precomputed power
    const oldContribution =
      (oldByte * this.basePowers[this.windowSize - 1]) >>> 0;

    // Update hash: remove old byte, shift, add new byte
    this.rollingHash =
      ((this.rollingHash - oldContribution) * this.BASE + newByte) >>> 0;
  }

  /**
   * Process a single byte, extending the current window
   * @param byte Byte to add to window
   * @param callback Callback to invoke with results
   */
  processByte(byte: number): TknMinerResult {
    try {
      // Add byte to window and update rolling hash
      if (this.windowSize < this.maxWindowSize) {
        // Cache previous hash before growing window
        if (this.windowSize > 0) {
          this.previousHash = this.rollingHash;
        }
        this.windowBuffer[this.windowSize] = byte;
        this.windowSize++;
        this.addByteToHash(byte);
      } else {
        // Shift window left and add new byte at end
        const oldByte = this.windowBuffer[0];
        this.windowBuffer.copyWithin(0, 1);
        this.windowBuffer[this.windowSize - 1] = byte;
        this.updateRollingHash(oldByte, byte);
      }

      // Get current window hash (O(1) operation!)
      const currentWindowKey = this.rollingHash;

      if (this.cache.has(currentWindowKey)) {
        // This is the progression block -- the next step will grow this window by one byte
        this.cache.set(currentWindowKey, true);
        return { error: null, data: null };
      }

      /**
       * This is the completion block
       * Either the previous window was the longest known subsequence from the bank,
       * or the token is one byte in length and not currently in the bank
       */

      let token: Partial<OutputToken> = {};

      if (this.windowSize > 1) {
        /**
         * The previous window was the result of a merge of two known subsequences
         * and we should emit the previous window
         */
        const previousWindow = this.windowBuffer.subarray(
          0,
          this.windowSize - 1
        );
        // Use cached previous hash instead of recomputing
        const previousWindowKey = this.previousHash;

        this.cache.set(previousWindowKey, true);
        this.cache.set(currentWindowKey, true);

        try {
          token = this.constructToken(previousWindow);
        } catch (error) {
          return { error: error as Error, data: null };
        }

        // The current byte becomes the first byte of the new window
        this.windowSize = 0;
        this.rollingHash = 0; // Reset rolling hash
        this.previousHash = 0; // Reset previous hash
        this.windowBuffer[this.windowSize] = byte;
        this.windowSize++;
        this.addByteToHash(byte);

        return { error: null, data: token as OutputToken };
      } else {
        /**
         * There is no previous window because the first inclusion check failed
         * and we should emit the current window
         */
        const currentWindow = this.windowBuffer.subarray(0, this.windowSize);
        token = this.constructToken(currentWindow);
        this.cache.set(currentWindowKey, true);

        // Reset window to empty after emitting single-byte token
        this.windowSize = 0;
        this.rollingHash = 0;

        return { error: null, data: token as OutputToken };
      }
    } catch (error) {
      return { error: error as Error, data: null };
    }
  }

  /**
   * Process a string character by character, managing a sliding window
   * @param input String to process
   * @param callback Callback to invoke with results
   */
  processString(input: string): TknMinerResult[] {
    const inputBuffer = Buffer.from(input, "utf-8");

    const results: TknMinerResult[] = [];

    for (let i = 0; i < inputBuffer.length; i++) {
      const byte = inputBuffer[i];
      results.push(this.processByte(byte));
    }

    return results;
  }

  /**
   * Process raw buffer data directly
   * @param buffer Buffer to process
   * @param callback Callback to invoke with results
   */
  processBuffer(buffer: Buffer | Uint8Array): TknMinerResult[] {
    const results: TknMinerResult[] = [];

    for (let i = 0; i < buffer.length; i++) {
      results.push(this.processByte(buffer[i]));
    }

    return results;
  }

  private constructToken(windowBuffer: Uint8Array): OutputToken {
    // Create a copy to avoid reference issues - stay in Uint8Array
    const bufferCopy = new Uint8Array(windowBuffer);
    const value = this.textDecoder.decode(bufferCopy);

    return {
      buffer: bufferCopy,
      value,
      sessionIndex: this.sessionIndex++,
    };
  }

  /**
   * Flush remaining window content at end of processing
   * @returns Final token if window has content, null otherwise
   */
  flush(): TknMinerResult {
    if (this.windowSize > 0) {
      const finalWindow = this.windowBuffer.subarray(0, this.windowSize);
      const finalWindowKey = this.rollingHash;

      this.cache.set(finalWindowKey, true);

      try {
        const token = this.constructToken(finalWindow);

        // Clear state after flushing
        this.windowSize = 0;
        this.windowStart = 0;
        this.rollingHash = 0;
        this.previousHash = 0;

        return { error: null, data: token };
      } catch (error) {
        return { error: error as Error, data: null };
      }
    }

    return { error: null, data: null };
  }

  /**
   * Get current window state for debugging
   */
  getWindowState(): { size: number; content: string } {
    const currentWindow = this.windowBuffer.subarray(0, this.windowSize);
    return {
      size: this.windowSize,
      content: this.textDecoder.decode(currentWindow),
    };
  }

  /**
   * Clear the miner state
   */
  clear(): void {
    this.cache.clear();
    this.windowSize = 0;
    this.windowStart = 0;
    this.rollingHash = 0;
    this.previousHash = 0;
    this.windowBuffer = new Uint8Array(this.maxWindowSize);
    this.sessionIndex = 0;
  }
}
