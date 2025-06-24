import type { TokenCache } from "./token-cache";

export interface OutputToken {
  buffer: Uint8Array;
  sessionIndex: number;
}

export type LZSTCallback = (
  error: Error | null,
  data: OutputToken | null
) => Promise<void>;

export type LZSTResult =
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

/**
 * Lempel-Ziv Stream Tokenizer
 *
 * This class implements the Lempel-Ziv Stream Tokenizer algorithm, which is a
 * lossless data compression algorithm. It is a variant of the Lempel-Ziv algorithm
 * that is optimized for streaming data.
 *
 * The algorithm works by maintaining a sliding window of the most recent bytes,
 * and checking if the current window is a known subsequence. If it is, the algorithm
 * emits a token for the previous window and starts a new window.
 *
 * The algorithm is designed to operate from a two stage memory:
 * 1. A short term local memory implemented as a LRU cache
 * 2. A long term global memory implemented as a directed property graph of all observed subsequences
 */
export class LZST {
  private highConfidenceCache: TokenCache;
  private lowConfidenceCache: TokenCache;
  private windowBuffer: Uint8Array;
  private windowSize: number = 0;
  private maxWindowSize: number;
  private sessionIndex: number = 0;

  constructor(
    highConfidenceCache: TokenCache,
    lowConfidenceCache: TokenCache,
    maxWindowSize: number = 1024
  ) {
    this.highConfidenceCache = highConfidenceCache;
    this.lowConfidenceCache = lowConfidenceCache;
    this.maxWindowSize = maxWindowSize;
    this.windowBuffer = new Uint8Array(maxWindowSize);
  }

  /**
   * Process a single byte, extending the current window
   * @param byte Byte to add to window
   * @param callback Callback to invoke with results
   */
  processByte(byte: number): LZSTResult {
    try {
      if (this.windowSize < this.maxWindowSize) {
        this.windowBuffer[this.windowSize] = byte;
        this.windowSize++;
      } else {
        this.windowBuffer.copyWithin(0, 1);
        this.windowBuffer[this.windowSize - 1] = byte;
      }

      const currentWindow = this.windowBuffer.subarray(0, this.windowSize);
      if (
        this.highConfidenceCache.contains(currentWindow) ||
        this.lowConfidenceCache.contains(currentWindow)
      ) {
        /*
         * This is the progression block -- the next step will grow this window by one byte
         */
        this.highConfidenceCache.add(currentWindow);
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

        this.highConfidenceCache.add(previousWindow);
        this.lowConfidenceCache.add(currentWindow);

        try {
          token = this.constructToken(previousWindow);
        } catch (error) {
          return { error: error as Error, data: null };
        }

        /**
         * The current byte becomes the first byte of the new window
         */
        this.windowSize = 0;
        this.windowBuffer[this.windowSize] = byte;
        this.windowSize++;

        return { error: null, data: token as OutputToken };
      } else {
        /**
         * There is no previous window because the first inclusion check failed
         * and we should emit the current window
         */
        const currentWindow = this.windowBuffer.subarray(0, this.windowSize);
        token = this.constructToken(currentWindow);
        this.lowConfidenceCache.add(currentWindow);

        this.windowSize = 0;

        return { error: null, data: token as OutputToken };
      }
    } catch (error) {
      return { error: error as Error, data: null };
    }
  }

  /**
   * Process raw buffer data directly
   * @param buffer Buffer to process
   * @param callback Callback to invoke with results
   */
  processBuffer(buffer: Buffer | Uint8Array): LZSTResult[] {
    const results: LZSTResult[] = [];

    for (let i = 0; i < buffer.length; i++) {
      results.push(this.processByte(buffer[i]));
    }

    return results;
  }

  private constructToken(windowBuffer: Uint8Array): OutputToken {
    const bufferCopy = new Uint8Array(windowBuffer);

    return {
      buffer: bufferCopy,
      sessionIndex: this.sessionIndex++,
    };
  }

  /**
   * Flush remaining window content at end of processing
   * @returns Final token if window has content, null otherwise
   */
  flush(): LZSTResult {
    if (this.windowSize > 0) {
      const finalWindow = this.windowBuffer.subarray(0, this.windowSize);
      this.lowConfidenceCache.add(finalWindow);

      try {
        const token = this.constructToken(finalWindow);

        this.windowSize = 0;

        return { error: null, data: token };
      } catch (error) {
        return { error: error as Error, data: null };
      }
    }

    return { error: null, data: null };
  }

  /**
   * Clear the miner state
   */
  clear(): void {
    this.windowSize = 0;
    this.windowBuffer = new Uint8Array(this.maxWindowSize);
    this.sessionIndex = 0;
  }
}
