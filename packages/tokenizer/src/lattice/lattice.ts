import { Database, Statement } from "bun:sqlite";
import { LRUCache } from "lru-cache";

export type Pair = {
  from: string;
  to: string;
  weight: number;
};

export type Token = {
  id: number;
  bytes: string; // hex
  degree: number;
  strength: number;
};

// ---- Query parameter & result types ----
type P_GetEdge = { $from: string; $to: string };
type R_GetEdge = { strength: number; degree: number; match: number | null };

type P_CountPred = { $to: string };
type R_CountPred = { n_predecessors: number | null };

type P_PrefixSearch = { $esc: string };
type R_PrefixSearch = { bytes: string };

type P_TransitionsFrom = { $from: string };
type R_TransitionsFrom = { bytes: string; weight: number };

type P_GetTokenByBytes = { $bytes: string };
type R_GetTokenByBytes = {
  id: number;
  bytes: string;
  degree: number;
  strength: number;
};

type P_GetTokenById = { $id: number };
type R_GetTokenById = {
  id: number;
  bytes: string;
  degree: number;
  strength: number;
};

type R_LatticeStats = {
  // Vocabulary statistics
  total_tokens: number;

  // Token metrics
  avg_token_strength: number;
  max_token_strength: number;
  min_token_strength: number;
  median_token_strength: number;

  avg_token_degree: number;
  max_token_degree: number;
  min_token_degree: number;
  median_token_degree: number;

  // Edge statistics
  total_edges: number;
  avg_edge_weight: number;
  max_edge_weight: number;
  min_edge_weight: number;
  median_edge_weight: number;

  // Connectivity analysis
  isolated_tokens: number;
  tokens_with_outgoing: number;
  tokens_with_incoming: number;

  // Distribution percentiles
  strength_p95: number;
  strength_p99: number;
  degree_p95: number;
  degree_p99: number;
  weight_p95: number;
  weight_p99: number;
};

/**
 * Lattice provides a graph-based token storage and retrieval system.
 * Optimized for high-throughput training workloads with intelligent caching.
 */
export class Lattice {
  private _db: Database;

  // Query result caches (used during inference/tokenization)
  private _edgeCache = new LRUCache<string, R_GetEdge>({ max: 1000 });
  private _predecessorCache = new LRUCache<string, number>({ max: 500 });
  private _prefixCache = new LRUCache<string, R_PrefixSearch[]>({ max: 500 });
  private _transitionsCache = new LRUCache<string, R_TransitionsFrom[]>({
    max: 500,
  });
  private _tokenByBytesCache = new LRUCache<string, R_GetTokenByBytes>({
    max: 1000,
  });
  private _tokenByIdCache = new LRUCache<number, R_GetTokenById>({ max: 1000 });

  // Read-only prepared statements (used by tokenizer)
  private readonly _stmtGetEdge!: Statement<R_GetEdge, [P_GetEdge]>;
  private readonly _stmtCountPredecessors!: Statement<
    R_CountPred,
    [P_CountPred]
  >;
  private readonly _stmtPrefixSearch!: Statement<
    R_PrefixSearch,
    [P_PrefixSearch]
  >;
  private readonly _stmtTransitionsFrom!: Statement<
    R_TransitionsFrom,
    [P_TransitionsFrom]
  >;
  private readonly _stmtGetTokenByBytes!: Statement<
    R_GetTokenByBytes,
    [P_GetTokenByBytes]
  >;
  private readonly _stmtGetTokenById!: Statement<
    R_GetTokenById,
    [P_GetTokenById]
  >;

  // Write operation prepared statements
  private readonly _stmtUpdateTokenDegrees!: Statement;

  // Statistical analysis prepared statement
  private readonly _stmtGetLatticeStats!: Statement<R_LatticeStats, []>;

  constructor({
    database,
  }: {
    database?: { instance?: Database; path?: string };
  }) {
    this._db =
      database?.instance ??
      new Database(database?.path ?? ":memory:", {
        safeIntegers: false,
      });

    // Pragmas: optimized for maximum write throughput
    this._db.run("PRAGMA journal_mode = WAL;");
    this._db.run("PRAGMA synchronous = OFF;"); // Faster writes, less durability
    this._db.run("PRAGMA foreign_keys = OFF;"); // Skip FK checks during bulk insert
    this._db.run("PRAGMA cache_size = -64000;"); // 64MB cache
    this._db.run("PRAGMA temp_store = MEMORY;"); // Keep temp data in memory

    // ---------- Schema ----------
    this._db.run(`
      CREATE TABLE IF NOT EXISTS Token (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        bytes     TEXT UNIQUE NOT NULL,
        degree    INTEGER NOT NULL DEFAULT 0,
        strength  INTEGER NOT NULL DEFAULT 0
      );
    `);

    this._db.run(`
      CREATE TABLE IF NOT EXISTS Edge (
        from_bytes TEXT NOT NULL,
        to_bytes   TEXT NOT NULL,
        weight     INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (from_bytes, to_bytes),
        FOREIGN KEY (from_bytes) REFERENCES Token(bytes) ON DELETE CASCADE,
        FOREIGN KEY (to_bytes)   REFERENCES Token(bytes) ON DELETE CASCADE
      );
    `);

    this._db.run(`
      CREATE VIEW IF NOT EXISTS v_edge_predecessors AS
      SELECT
        to_bytes,
        COUNT(DISTINCT from_bytes) AS n_predecessors
      FROM Edge
      WHERE weight > 0
      GROUP BY to_bytes;
    `);

    this._db.run(`
      CREATE VIEW IF NOT EXISTS v_edge_stats AS
      SELECT COUNT(*) AS n_bigrams
      FROM Edge
      WHERE weight > 0;
    `);

    // ---------- Indexes ----------
    this._db.run(`CREATE INDEX IF NOT EXISTS idx_token_bytes ON Token(bytes);`);
    this._db.run(
      `CREATE INDEX IF NOT EXISTS idx_edge_from_to ON Edge(from_bytes, to_bytes);`
    );
    this._db.run(`CREATE INDEX IF NOT EXISTS idx_edge_to ON Edge(to_bytes);`);

    // ---------- Read-only prepared statements ----------
    this._stmtGetEdge = this._db.query<R_GetEdge, [P_GetEdge]>(`
      SELECT
        t.strength AS strength,    -- c
        t.degree   AS degree,      -- T
        b.weight   AS match        -- r
      FROM Token t
      LEFT JOIN Edge b
        ON b.from_bytes = t.bytes
       AND b.to_bytes   = $to
      WHERE t.bytes = $from;
    `);

    this._stmtCountPredecessors = this._db.query<R_CountPred, [P_CountPred]>(`
      SELECT n_predecessors
      FROM v_edge_predecessors
      WHERE to_bytes = $to;
    `);

    this._stmtPrefixSearch = this._db.query<R_PrefixSearch, [P_PrefixSearch]>(`
      SELECT bytes
      FROM Token
      WHERE bytes = substr($esc, 1, length(bytes))
      ORDER BY length(bytes) DESC
    `);

    this._stmtTransitionsFrom = this._db.query<
      R_TransitionsFrom,
      [P_TransitionsFrom]
    >(`
      SELECT to_bytes AS bytes, weight
      FROM Edge
      WHERE from_bytes = $from
    `);

    this._stmtGetTokenByBytes = this._db.query<
      R_GetTokenByBytes,
      [P_GetTokenByBytes]
    >(`
      SELECT id, bytes, degree, strength
      FROM Token
      WHERE bytes = $bytes
    `);

    this._stmtGetTokenById = this._db.query<R_GetTokenById, [P_GetTokenById]>(`
      SELECT id, bytes, degree, strength
      FROM Token
      WHERE id = $id
    `);

    this._stmtUpdateTokenDegrees = this._db.query(`
      UPDATE Token 
      SET degree = (
        SELECT COUNT(DISTINCT to_bytes) 
        FROM Edge 
        WHERE Edge.from_bytes = Token.bytes AND Edge.weight > 0
      )
      WHERE EXISTS (
        SELECT 1 FROM Edge WHERE Edge.from_bytes = Token.bytes
      )
    `);

    this._stmtGetLatticeStats = this._db.query<R_LatticeStats, []>(`
      WITH token_stats AS (
        SELECT 
          COUNT(*) as total_tokens,
          COALESCE(AVG(CAST(strength AS REAL)), 0) as avg_token_strength,
          COALESCE(MAX(strength), 0) as max_token_strength,
          COALESCE(MIN(strength), 0) as min_token_strength,
          COALESCE(AVG(CAST(degree AS REAL)), 0) as avg_token_degree,
          COALESCE(MAX(degree), 0) as max_token_degree,
          COALESCE(MIN(degree), 0) as min_token_degree
        FROM Token
      ),
      edge_stats AS (
        SELECT 
          COUNT(*) as total_edges,
          COALESCE(AVG(CAST(weight AS REAL)), 0) as avg_edge_weight,
          COALESCE(MAX(weight), 0) as max_edge_weight,
          COALESCE(MIN(weight), 0) as min_edge_weight
        FROM Edge
        WHERE weight > 0
      ),
      connectivity_stats AS (
        SELECT
          COUNT(CASE WHEN out_degree = 0 AND in_degree = 0 THEN 1 END) as isolated_tokens,
          COUNT(CASE WHEN out_degree > 0 THEN 1 END) as tokens_with_outgoing,
          COUNT(CASE WHEN in_degree > 0 THEN 1 END) as tokens_with_incoming
        FROM (
          SELECT 
            t.bytes,
            COALESCE(out_edges.out_degree, 0) as out_degree,
            COALESCE(in_edges.in_degree, 0) as in_degree
          FROM Token t
          LEFT JOIN (
            SELECT from_bytes, COUNT(*) as out_degree
            FROM Edge WHERE weight > 0
            GROUP BY from_bytes
          ) out_edges ON t.bytes = out_edges.from_bytes
          LEFT JOIN (
            SELECT to_bytes, COUNT(*) as in_degree  
            FROM Edge WHERE weight > 0
            GROUP BY to_bytes
          ) in_edges ON t.bytes = in_edges.to_bytes
        )
      ),
      token_count AS (SELECT COUNT(*) as n FROM Token),
      edge_count AS (SELECT COUNT(*) as n FROM Edge WHERE weight > 0),
      percentiles AS (
        SELECT
          COALESCE((SELECT strength FROM Token ORDER BY strength LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.5 AS INTEGER)) FROM token_count)), 0) as median_token_strength,
          COALESCE((SELECT strength FROM Token ORDER BY strength LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.95 AS INTEGER)) FROM token_count)), 0) as strength_p95,
          COALESCE((SELECT strength FROM Token ORDER BY strength LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.99 AS INTEGER)) FROM token_count)), 0) as strength_p99,
          COALESCE((SELECT degree FROM Token ORDER BY degree LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.5 AS INTEGER)) FROM token_count)), 0) as median_token_degree,
          COALESCE((SELECT degree FROM Token ORDER BY degree LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.95 AS INTEGER)) FROM token_count)), 0) as degree_p95,
          COALESCE((SELECT degree FROM Token ORDER BY degree LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.99 AS INTEGER)) FROM token_count)), 0) as degree_p99,
          COALESCE((SELECT weight FROM Edge WHERE weight > 0 ORDER BY weight LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.5 AS INTEGER)) FROM edge_count)), 0) as median_edge_weight,
          COALESCE((SELECT weight FROM Edge WHERE weight > 0 ORDER BY weight LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.95 AS INTEGER)) FROM edge_count)), 0) as weight_p95,
          COALESCE((SELECT weight FROM Edge WHERE weight > 0 ORDER BY weight LIMIT 1 OFFSET (SELECT MAX(0, CAST(n * 0.99 AS INTEGER)) FROM edge_count)), 0) as weight_p99
      )
      SELECT 
        ts.total_tokens,
        ts.avg_token_strength,
        ts.max_token_strength,
        ts.min_token_strength,
        p.median_token_strength,
        ts.avg_token_degree,
        ts.max_token_degree,
        ts.min_token_degree,
        p.median_token_degree,
        es.total_edges,
        es.avg_edge_weight,
        es.max_edge_weight,
        es.min_edge_weight,
        p.median_edge_weight,
        cs.isolated_tokens,
        cs.tokens_with_outgoing,
        cs.tokens_with_incoming,
        p.strength_p95,
        p.strength_p99,
        p.degree_p95,
        p.degree_p99,
        p.weight_p95,
        p.weight_p99
      FROM token_stats ts, edge_stats es, connectivity_stats cs, percentiles p
    `);
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

  transitionsFrom = (from: string): R_TransitionsFrom[] => {
    const cached = this._transitionsCache.get(from);
    if (cached !== undefined) return cached;

    const result = this._stmtTransitionsFrom.all({ $from: from });
    this._transitionsCache.set(from, result);
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
  getLatticeStats = (): R_LatticeStats | null => {
    return this._stmtGetLatticeStats.get();
  };

  // ---- Cache Management ----

  clearCaches(): void {
    this._edgeCache.clear();
    this._predecessorCache.clear();
    this._prefixCache.clear();
    this._transitionsCache.clear();
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
}
