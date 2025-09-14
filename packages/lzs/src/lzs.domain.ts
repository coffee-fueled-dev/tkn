import type { ILZSMonitorConfig, IStats } from "./monitor.domain";
import type {
  IFlushResult,
  IKeyGeneratorConfig,
  IKeyGenerator,
  ILZSCacheConfig,
  ILZSCache,
} from "./_shared.domain";
import type { LZSMonitor } from "./monitor";
import type { ByteTrie } from "./byte-trie";

/**
 * Configuration interface for LZS instances
 */
export interface ILZSConfig {
  keyGenerator?: IKeyGeneratorConfig | IKeyGenerator;
  cache?: ILZSCacheConfig | ILZSCache;
  monitor?: LZSMonitor | ILZSMonitorConfig | false;
  trie?: ByteTrie | false;
  mdl?: {
    alpha?: number; // default ~0.1 (Laplace smoothing)
    zMode?: "child-degree" | "fixed"; // default "child-degree"
    zFixed?: number; // used if zMode === "fixed" (e.g., 256)
    // EWMA relative surprise parameters
    beta?: number; // EWMA decay (default ~0.02)
    c?: number; // surprise tolerance (default ~0.7)
    // Entropy scaling parameters
    tau?: number; // entropy scaling factor (default ~0.8)
  };
}

/**
 * Interface for Lempel-Ziv Stream Tokenizer
 * Defines the contract for the core, synchronous pattern finding and tokenization logic.
 */
export interface ILZS {
  readonly cache: ILZSCache;

  /**
   * The key generator used for hashing patterns
   */
  readonly keyGenerator: IKeyGenerator;

  /**
   * Current memory usage in bytes (platform dependent)
   */
  readonly memoryUsage: number;

  /**
   * Current throughput metrics, null if no processing has occurred
   */
  readonly stats: IStats | null;

  /**
   * Processes a single byte and returns the longest known subsequence if found
   * @param byte The byte to process
   * @returns Hex bytes string of the longest known subsequence, or null if pattern continues
   */
  processByte(byte: number): number[] | null;

  /**
   * Flushes the current state and returns memory and current candidate
   * @returns Object containing the cache memory and current candidate bytes
   */
  flush(): IFlushResult;

  /**
   * Clears all internal state including cache, candidate, and metrics
   */
  clear(): void;
}
