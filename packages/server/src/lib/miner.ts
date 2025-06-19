/**
 * tknMiner - Token sequence parser
 * It processes incoming data buffers and identifies token sequences.
 */

import { hello } from "../metrics/logs";
import { createHash } from "crypto";
import { LRUCache } from "lru-cache";
import type { HashedValue } from "./cyrb53";
import { recordOperation } from "../metrics";

// Define the type for the token processed by the tknMiner
export interface OutputToken {
  hashes: HashedValue[];
  idx: number;
}

export type TknMinerCallback = (
  error: Error | null,
  data?: OutputToken
) => void;

export class TknMiner {
  // Replace explicit lifespan bank with LRU cache
  private bank: LRUCache<string, boolean>;
  private window: HashedValue[] = [];
  private idx: number = 0;
  // Cache for frequently used sequences
  private keyCache = new Map<string, string>();

  constructor(bankSize: number = 1000) {
    // Initialize LRU cache with a max size
    this.bank = new LRUCache<string, boolean>({
      max: bankSize,
      // Optional: Add TTL-based expiration if needed
      // ttl: 30000, // 30 seconds in milliseconds
    });

    hello.server.info("TknMiner initialized with LRU token bank");
  }

  /**
   * Get a cached key or create a new one - handles caching
   */
  private getKey(hashes: HashedValue[]): string {
    // Use a simple cache key based on the first few bytes of each hash
    const simpleCacheKey = hashes
      .map((h) =>
        h.length > 4
          ? `${h[0]}.${h[1]}.${h[2]}.${h[3]}`
          : Array.from(h).join(".")
      )
      .join(",");

    let key = this.keyCache.get(simpleCacheKey);
    if (key === undefined) {
      key = this.createKey(hashes);
      // Only cache if the sequence is of reasonable size
      if (hashes.length < 10) {
        this.keyCache.set(simpleCacheKey, key);
      }
    }
    return key;
  }

  /**
   * Process a chunk of hashed values and emit token sequences
   * @param hashedChunk Array of HashedValues to process
   * @param callback Callback to invoke with results
   */
  transform(hashedChunk: HashedValue[], callback: TknMinerCallback) {
    const startTime = performance.now();
    hello.tknMiner.debug("Received chunk of hashed values");
    let segment: HashedValue;

    try {
      for (let i = 0; i < hashedChunk.length; i++) {
        segment = hashedChunk[i];
        this.window.push(segment);

        // Generate key for current window directly
        const windowKey = this.getKey(this.window);

        // No need to decrement lifespans - LRU cache handles eviction automatically

        if (this.bank.has(windowKey)) {
          recordOperation(
            "tknMiner",
            "duplicate-token",
            performance.now() - startTime
          );
          callback(null);
          return;
        }

        const known = this.window.slice(0, -1);
        const knownKey = this.getKey(known);

        hello.tknMiner.debug("Known window (excluding current):", { knownKey });

        // Update the bank with the new token data
        // The value doesn't matter, just using the cache as a set
        this.bank.set(knownKey, true);
        this.bank.set(windowKey, true);

        // Create the token to emit
        const token: OutputToken = {
          hashes: known,
          idx: this.idx,
        };

        // Reset the window to start with the current segment
        this.window = [segment];
        this.idx++;

        recordOperation(
          "tknMiner",
          "token-processed",
          performance.now() - startTime,
          false,
          ["sync-stream"]
        );

        // Call the callback with the new token
        callback(null, token);
        return;
      }
    } catch (error) {
      recordOperation(
        "tknMiner",
        "token-processing",
        performance.now() - startTime,
        true
      );
      callback(error as Error);
    }
  }

  /**
   * Create an efficient string key from an array of HashedValues
   * Optimized for high-throughput with minimal allocations
   */
  private createKey(hashes: HashedValue[]): string {
    // For very small arrays, direct concatenation is fastest
    if (hashes.length === 0) return "";
    if (hashes.length === 1) return Buffer.from(hashes[0]).toString("base64");

    // For larger arrays, we use a meta-hash approach
    // This is dramatically faster than concatenating and much more memory efficient
    const hasher = createHash("sha1");

    // Update the hasher with each hash's bytes directly
    for (const hash of hashes) {
      hasher.update(hash);
      // Add a separator to prevent collisions between different arrangements
      hasher.update("|");
    }

    // Return a compact base64 representation
    return hasher.digest("base64");
  }

  /**
   * Get bank statistics
   */
  getBankStats(): { size: number; capacity: number } {
    return {
      size: this.bank.size,
      capacity: this.bank.max,
    };
  }

  public getWindow() {
    return this.window;
  }

  public getBank() {
    return this.bank;
  }
}
