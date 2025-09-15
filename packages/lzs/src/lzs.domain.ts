import type { ILZSMonitorConfig, IStats } from "./monitor.domain";
import type {
  IFlushResult,
  IKeyGeneratorConfig,
  IKeyGenerator,
  ILZSCacheConfig,
  ILZSCache,
} from "./_shared.domain";
import type { LZSMonitor } from "./monitor";
import type { ILZSTrie } from "./trie";

/**
 * Configuration interface for LZS instances
 */
export interface ILZSConfig {
  keyGenerator?: IKeyGeneratorConfig | IKeyGenerator;
  cache?: ILZSCacheConfig | ILZSCache;
  monitor?: LZSMonitor | ILZSMonitorConfig | false;
  trie?: ILZSTrie | false;
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
   * Current memory usage in ints (platform dependent)
   */
  readonly memoryUsage: number;

  /**
   * Current throughput metrics, null if no processing has occurred
   */
  readonly stats: IStats | null;

  /**
   * Processes a single int and returns the longest known subsequence if found
   * @param int The int to process
   * @returns Hex ints string of the longest known subsequence, or null if pattern continues
   */
  push(int: number): number[] | null;

  /**
   * Flushes the current state and returns memory and current candidate
   * @returns Object containing the cache memory and current candidate ints
   */
  flush(): IFlushResult;

  /**
   * Clears all internal state including cache, candidate, and metrics
   */
  clear(): void;
}
