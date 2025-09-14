import { Database, Statement } from "bun:sqlite";
import { LRUCache } from "lru-cache";
import type {
  P_CountPred,
  P_GetEdge,
  P_GetTokenByBytes,
  P_GetTokenById,
  P_PrefixSearch,
  P_RefinedTransitionsFrom,
  Pair,
  R_CountPred,
  R_GetEdge,
  R_GetTokenByBytes,
  R_GetTokenById,
  R_LatticeStats,
  R_PrefixSearch,
  R_RefinedTransitionsFrom,
  Token,
} from "./schema";
import { createSchema } from "./schema";
import type { ILattice, ILatticeConfig } from "./lattice.domain";

/**
 * Lattice provides a graph-based token storage and retrieval system.
 * Optimized for high-throughput training workloads with intelligent caching.
 */
export class Lattice implements ILattice {
  readonly _config: ILatticeConfig;
  private _db: Database;

  // Query result caches (used during inference/tokenization)
  private _edgeCache = new LRUCache<string, R_GetEdge>({ max: 1000 });
  private _predecessorCache = new LRUCache<string, number>({ max: 500 });
  private _prefixCache = new LRUCache<string, R_PrefixSearch[]>({ max: 500 });
  private _refinedTransitionsCache = new LRUCache<
    string,
    R_RefinedTransitionsFrom[]
  >({
    max: 500,
  });
  private _tokenByBytesCache = new LRUCache<string, R_GetTokenByBytes>({
    max: 1000,
  });
  private _tokenByIdCache = new LRUCache<number, R_GetTokenById>({ max: 1000 });

  // Read-only prepared statements (used by tokenizer)
  private readonly _stmtGetEdge: Statement<R_GetEdge, [P_GetEdge]>;
  private readonly _stmtCountPredecessors: Statement<
    R_CountPred,
    [P_CountPred]
  >;
  private readonly _stmtPrefixSearch: Statement<
    R_PrefixSearch,
    [P_PrefixSearch]
  >;
  private readonly _stmtRefinedTransitionsFrom: Statement<
    R_RefinedTransitionsFrom,
    [P_RefinedTransitionsFrom]
  >;
  private readonly _stmtGetTokenByBytes: Statement<
    R_GetTokenByBytes,
    [P_GetTokenByBytes]
  >;
  private readonly _stmtGetTokenById: Statement<
    R_GetTokenById,
    [P_GetTokenById]
  >;

  // Write operation prepared statements
  private readonly _stmtUpdateTokenDegrees: Statement;

  // Statistical analysis prepared statement
  private readonly _stmtGetLatticeStats: Statement<R_LatticeStats, []>;

  constructor(config: ILatticeConfig = {}) {
    this._config = config;
    this._db =
      config.database?.instance ??
      new Database(config.database?.path ?? ":memory:", {
        safeIntegers: false,
      });

    const statements = createSchema(this._db);
    this._stmtGetEdge = statements.stmtGetEdge;
    this._stmtCountPredecessors = statements.stmtCountPredecessors;
    this._stmtPrefixSearch = statements.stmtPrefixSearch;
    this._stmtRefinedTransitionsFrom = statements.stmtRefinedTransitionsFrom;
    this._stmtGetTokenByBytes = statements.stmtGetTokenByBytes;
    this._stmtGetTokenById = statements.stmtGetTokenById;
    this._stmtUpdateTokenDegrees = statements.stmtUpdateTokenDegrees;
    this._stmtGetLatticeStats = statements.stmtGetLatticeStats;
  }

  // ---- Query Methods (used by tokenizer) ----

  getEdge = ({ from, to }: Omit<Pair, "weight">): R_GetEdge | null => {
    const cacheKey = `${from}|${to}`;
    const cached = this._edgeCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const result = this._stmtGetEdge.get({
      $from: from,
      $to: to,
    });

    if (result) {
      this._edgeCache.set(cacheKey, result);
    }
    return result;
  };

  countPredecessors = (to: string): number | null => {
    const cached = this._predecessorCache.get(to);
    if (cached !== undefined) return cached;

    const result =
      this._stmtCountPredecessors.get({ $to: to })?.n_predecessors ?? null;
    if (result !== null) {
      this._predecessorCache.set(to, result);
    }
    return result;
  };

  prefixSearch = (esc: string): R_PrefixSearch[] => {
    const cached = this._prefixCache.get(esc);
    if (cached !== undefined) return cached;

    const result = this._stmtPrefixSearch.all({ $esc: esc });
    this._prefixCache.set(esc, result);
    return result;
  };

  refinedTransitionsFrom = (from: string): R_RefinedTransitionsFrom[] => {
    const cached = this._refinedTransitionsCache.get(from);
    if (cached !== undefined) return cached;

    const result = this._stmtRefinedTransitionsFrom.all({ $from: from });
    this._refinedTransitionsCache.set(from, result);
    return result;
  };

  getTokenByBytes = (bytes: string): R_GetTokenByBytes | null => {
    const cached = this._tokenByBytesCache.get(bytes);
    if (cached !== undefined) return cached;

    const result = this._stmtGetTokenByBytes.get({ $bytes: bytes });
    if (result) {
      this._tokenByBytesCache.set(bytes, result);
      // Also cache in the by-ID cache
      this._tokenByIdCache.set(result.id, result);
    }
    return result;
  };

  getTokenById = (id: number): R_GetTokenById | null => {
    const cached = this._tokenByIdCache.get(id);
    if (cached !== undefined) return cached;

    const result = this._stmtGetTokenById.get({ $id: id });
    if (result) {
      this._tokenByIdCache.set(id, result);
      // Also cache in the by-bytes cache
      this._tokenByBytesCache.set(result.bytes, result);
    }
    return result;
  };

  // ---- Database Access ----

  get db(): Database {
    return this._db;
  }

  close(): void {
    this._db.close(false);
  }

  // ---- Statistical Analysis ----

  /**
   * Get comprehensive statistical profile of the lattice topology.
   * Provides insights into vocabulary size, token metrics, edge statistics,
   * connectivity patterns, and distribution percentiles.
   */
  get stats(): R_LatticeStats | null {
    return this._stmtGetLatticeStats.get();
  }

  // ---- Cache Management ----

  clearCaches(): void {
    this._edgeCache.clear();
    this._predecessorCache.clear();
    this._prefixCache.clear();
    this._refinedTransitionsCache.clear();
    this._tokenByBytesCache.clear();
    this._tokenByIdCache.clear();
  }

  // ---- High-Performance Batch Ingest ----

  /**
   * High-performance batch ingest with SQL pre-aggregation.
   * Optimized for write-heavy workloads during training.
   */
  batchIngest = (tokens: Array<Omit<Token, "id">>, edges: Pair[]): void => {
    const tx = this._db.transaction(() => {
      this._aggregateAndUpsertTokens(tokens);
      this._aggregateAndUpsertEdges(edges);
    });
    tx();
  };

  /**
   * Update token degrees based on actual edge counts in database.
   * Call this after batch ingestion is complete.
   */
  updateTokenDegrees = (): void => {
    this._stmtUpdateTokenDegrees.run();
  };

  /** Aggregate tokens in temporary table, then bulk upsert */
  private _aggregateAndUpsertTokens = (
    tokens: Array<Omit<Token, "id">>
  ): void => {
    if (tokens.length === 0) return;

    // Create temporary table
    this._db.run(`
      CREATE TEMP TABLE temp_tokens (
        bytes TEXT, 
        degree INTEGER, 
        strength INTEGER
      )
    `);

    try {
      // Bulk insert into temp table
      const MAX_PARAMS = 30000;
      const maxTokensPerChunk = Math.floor(MAX_PARAMS / 3);

      for (let i = 0; i < tokens.length; i += maxTokensPerChunk) {
        const chunk = tokens.slice(i, i + maxTokensPerChunk);
        const valuesClause = Array(chunk.length).fill("(?, ?, ?)").join(", ");
        const params = chunk.flatMap((token) => [
          token.bytes,
          token.degree ?? 0,
          token.strength ?? 0,
        ]);

        this._db.run(`INSERT INTO temp_tokens VALUES ${valuesClause}`, params);
      }

      // Aggregate and upsert in one go
      this._db.run(`
        INSERT INTO Token (bytes, degree, strength)
        SELECT 
          bytes,
          SUM(degree) as total_degree,
          SUM(strength) as total_strength
        FROM temp_tokens
        GROUP BY bytes
        ON CONFLICT(bytes) DO UPDATE SET
          degree = degree + excluded.degree,
          strength = strength + excluded.strength
      `);
    } finally {
      this._db.run("DROP TABLE temp_tokens");
    }
  };

  /** Aggregate edges in temporary table, then bulk upsert */
  private _aggregateAndUpsertEdges = (edges: Pair[]): void => {
    if (edges.length === 0) return;

    // Create temporary table
    this._db.run(`
      CREATE TEMP TABLE temp_edges (
        from_bytes TEXT, 
        to_bytes TEXT, 
        weight INTEGER
      )
    `);

    try {
      // Bulk insert into temp table
      const MAX_PARAMS = 30000;
      const maxEdgesPerChunk = Math.floor(MAX_PARAMS / 3);

      for (let i = 0; i < edges.length; i += maxEdgesPerChunk) {
        const chunk = edges.slice(i, i + maxEdgesPerChunk);
        const valuesClause = Array(chunk.length).fill("(?, ?, ?)").join(", ");
        const params = chunk.flatMap((edge) => [
          edge.from,
          edge.to,
          edge.weight,
        ]);

        this._db.run(`INSERT INTO temp_edges VALUES ${valuesClause}`, params);
      }

      // Aggregate and upsert in one go
      this._db.run(`
        INSERT INTO Edge (from_bytes, to_bytes, weight)
        SELECT 
          from_bytes,
          to_bytes,
          SUM(weight) as total_weight
        FROM temp_edges
        GROUP BY from_bytes, to_bytes
        ON CONFLICT(from_bytes, to_bytes) DO UPDATE SET
          weight = weight + excluded.weight
      `);
    } finally {
      this._db.run("DROP TABLE temp_edges");
    }
  };

  // ---- Configuration ----

  get config(): ILatticeConfig {
    return this._config;
  }
}
