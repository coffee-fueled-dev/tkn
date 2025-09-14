import type { Database } from "bun:sqlite";
import type {
  Pair,
  Token,
  R_GetEdge,
  R_PrefixSearch,
  R_RefinedTransitionsFrom,
  R_GetTokenByBytes,
  R_GetTokenById,
  R_LatticeStats,
} from "./schema";

export interface ILatticeConfig {
  database?: {
    instance?: Database;
    path?: string;
  };
}

/**
 * Interface for Lattice - a graph-based token storage and retrieval system
 * Optimized for high-throughput training workloads with intelligent caching
 */
export interface ILattice {
  /**
   * Configuration used for instantiation
   */
  readonly _config: ILatticeConfig;

  /**
   * Get configuration used for instantiation
   */
  config: ILatticeConfig;

  // ===== QUERY METHODS =====

  /**
   * Get edge between two tokens
   */
  getEdge(edge: Omit<Pair, "weight">): R_GetEdge | null;

  /**
   * Count predecessors for a given token
   */
  countPredecessors(to: string): number | null;

  /**
   * Search for tokens with a given prefix
   */
  prefixSearch(esc: string): R_PrefixSearch[];

  /**
   * Get refined transitions from a given token
   */
  refinedTransitionsFrom(from: string): R_RefinedTransitionsFrom[];

  /**
   * Get token by bytes
   */
  getTokenByBytes(bytes: string): R_GetTokenByBytes | null;

  /**
   * Get token by ID
   */
  getTokenById(id: number): R_GetTokenById | null;

  // ===== DATABASE ACCESS =====

  /**
   * Get the underlying database instance
   */
  readonly db: Database;

  /**
   * Close the database connection
   */
  close(): void;

  // ===== STATISTICS =====

  /**
   * Get comprehensive statistical profile of the lattice topology
   */
  readonly stats: R_LatticeStats | null;

  // ===== CACHE MANAGEMENT =====

  /**
   * Clear all internal caches
   */
  clearCaches(): void;

  // ===== BATCH OPERATIONS =====

  /**
   * High-performance batch ingest with SQL pre-aggregation
   * Optimized for write-heavy workloads during training
   */
  batchIngest(tokens: Array<Omit<Token, "id">>, edges: Pair[]): void;

  /**
   * Update token degrees based on actual edge counts in database
   * Call this after batch ingestion is complete
   */
  updateTokenDegrees(): void;
}
