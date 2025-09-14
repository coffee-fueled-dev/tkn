import { Database, Statement } from "bun:sqlite";

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
export type P_GetEdge = { $from: string; $to: string };
export type R_GetEdge = {
  strength: number;
  degree: number;
  match: number | null;
};

export type P_CountPred = { $to: string };
export type R_CountPred = { n_predecessors: number | null };

export type P_PrefixSearch = { $esc: string };
export type R_PrefixSearch = { bytes: string };

export type P_TransitionsFrom = { $from: string };
export type R_TransitionsFrom = { bytes: string; weight: number };

export type P_GetTokenByBytes = { $bytes: string };
export type R_GetTokenByBytes = {
  id: number;
  bytes: string;
  degree: number;
  strength: number;
};

export type P_GetTokenById = { $id: number };
export type R_GetTokenById = {
  id: number;
  bytes: string;
  degree: number;
  strength: number;
};

export type R_LatticeStats = {
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

export function createSchema(db: Database) {
  // Pragmas: optimized for maximum write throughput
  db.run("PRAGMA journal_mode = WAL;");
  db.run("PRAGMA synchronous = OFF;"); // Faster writes, less durability
  db.run("PRAGMA foreign_keys = OFF;"); // Skip FK checks during bulk insert
  db.run("PRAGMA cache_size = -64000;"); // 64MB cache
  db.run("PRAGMA temp_store = MEMORY;"); // Keep temp data in memory

  // ---------- Schema ----------
  db.run(`
      CREATE TABLE IF NOT EXISTS Token (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        bytes     TEXT UNIQUE NOT NULL,
        degree    INTEGER NOT NULL DEFAULT 0,
        strength  INTEGER NOT NULL DEFAULT 0
      );
    `);

  db.run(`
      CREATE TABLE IF NOT EXISTS Edge (
        from_bytes TEXT NOT NULL,
        to_bytes   TEXT NOT NULL,
        weight     INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (from_bytes, to_bytes),
        FOREIGN KEY (from_bytes) REFERENCES Token(bytes) ON DELETE CASCADE,
        FOREIGN KEY (to_bytes)   REFERENCES Token(bytes) ON DELETE CASCADE
      );
    `);

  db.run(`
      CREATE VIEW IF NOT EXISTS v_edge_predecessors AS
      SELECT
        to_bytes,
        COUNT(DISTINCT from_bytes) AS n_predecessors
      FROM Edge
      WHERE weight > 0
      GROUP BY to_bytes;
    `);

  db.run(`
      CREATE VIEW IF NOT EXISTS v_edge_stats AS
      SELECT COUNT(*) AS n_bigrams
      FROM Edge
      WHERE weight > 0;
    `);

  // ---------- Optimization Views ----------

  // Incoming strength per token (Σ incoming weights)
  db.run(`
      CREATE VIEW IF NOT EXISTS v_in_strength AS
      SELECT to_bytes AS bytes, SUM(weight) AS in_strength
      FROM Edge
      GROUP BY to_bytes;
    `);

  // Total edge mass
  db.run(`
      CREATE VIEW IF NOT EXISTS v_totals AS
      SELECT SUM(weight) AS total_edges FROM Edge;
    `);

  // Unique incoming predecessors for KN & continuation stats
  db.run(`
      CREATE VIEW IF NOT EXISTS v_continuations AS
      SELECT to_bytes AS bytes, COUNT(DISTINCT from_bytes) AS n_predecessors
      FROM Edge
      WHERE weight > 0
      GROUP BY to_bytes;
    `);

  // PMI (pointwise mutual information) for edge scoring
  db.run(`
      CREATE VIEW IF NOT EXISTS v_edge_pmi AS
      WITH tot AS (SELECT total_edges FROM v_totals),
      from_s AS (
        SELECT bytes, strength FROM Token
      ),
      to_s AS (
        SELECT bytes, in_strength FROM v_in_strength
      )
      SELECT
        e.from_bytes, e.to_bytes, e.weight,
        CAST(
          ln(1.0 * e.weight * (SELECT total_edges FROM tot)
            / ( (SELECT strength     FROM from_s WHERE bytes=e.from_bytes)
              * (SELECT in_strength FROM to_s   WHERE bytes=e.to_bytes) )
          ) AS REAL
        ) AS pmi
      FROM Edge e;
    `);

  // DICE coefficient for robust edge scoring with tiny counts
  db.run(`
      CREATE VIEW IF NOT EXISTS v_edge_dice AS
      SELECT
        e.from_bytes, e.to_bytes, e.weight,
        2.0 * e.weight / (
          (SELECT strength     FROM Token        WHERE bytes=e.from_bytes) +
          (SELECT in_strength  FROM v_in_strength WHERE bytes=e.to_bytes)
        ) AS dice
      FROM Edge e;
    `);

  // Right-branching entropy for boundary detection
  db.run(`
      CREATE VIEW IF NOT EXISTS v_right_entropy AS
      WITH outmass AS (
        SELECT from_bytes, SUM(weight) AS out_w
        FROM Edge
        GROUP BY from_bytes
      ),
      probs AS (
        SELECT e.from_bytes, e.to_bytes, 1.0*e.weight / o.out_w AS p
        FROM Edge e JOIN outmass o ON o.from_bytes=e.from_bytes
      )
      SELECT from_bytes AS bytes,
             -SUM(p * ln(p)) AS H_right
      FROM probs
      GROUP BY from_bytes;
    `);

  // Refined edges with Top-K pruning by PMI (K=8)
  db.run(`
      CREATE VIEW IF NOT EXISTS v_refined_edges AS
      WITH scored AS (
        SELECT e.*,
               ROW_NUMBER() OVER (PARTITION BY from_bytes ORDER BY pmi DESC, weight DESC) AS rn
        FROM v_edge_pmi e
      )
      SELECT from_bytes, to_bytes, weight, pmi
      FROM scored
      WHERE rn <= 8;
    `);

  // ---------- Indexes ----------
  db.run(`CREATE INDEX IF NOT EXISTS idx_token_bytes ON Token(bytes);`);
  db.run(
    `CREATE INDEX IF NOT EXISTS idx_edge_from_to ON Edge(from_bytes, to_bytes);`
  );
  db.run(`CREATE INDEX IF NOT EXISTS idx_edge_to ON Edge(to_bytes);`);

  // ---------- Read-only prepared statements ----------
  const stmtGetEdge = db.query<R_GetEdge, [P_GetEdge]>(`
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

  const stmtCountPredecessors = db.query<R_CountPred, [P_CountPred]>(`
      SELECT n_predecessors
      FROM v_edge_predecessors
      WHERE to_bytes = $to;
    `);

  const stmtPrefixSearch = db.query<R_PrefixSearch, [P_PrefixSearch]>(`
      SELECT bytes
      FROM Token
      WHERE bytes = substr($esc, 1, length(bytes))
      ORDER BY length(bytes) DESC
    `);

  const stmtTransitionsFrom = db.query<R_TransitionsFrom, [P_TransitionsFrom]>(`
      SELECT to_bytes AS bytes, weight
      FROM Edge
      WHERE from_bytes = $from
    `);

  const stmtGetTokenByBytes = db.query<R_GetTokenByBytes, [P_GetTokenByBytes]>(`
      SELECT id, bytes, degree, strength
      FROM Token
      WHERE bytes = $bytes
    `);

  const stmtGetTokenById = db.query<R_GetTokenById, [P_GetTokenById]>(`
      SELECT id, bytes, degree, strength
      FROM Token
      WHERE id = $id
    `);

  const stmtUpdateTokenDegrees = db.query(`
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

  const stmtGetLatticeStats = db.query<R_LatticeStats, []>(`
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

  return {
    stmtGetEdge,
    stmtCountPredecessors,
    stmtPrefixSearch,
    stmtTransitionsFrom,
    stmtGetTokenByBytes,
    stmtGetTokenById,
    stmtUpdateTokenDegrees,
    stmtGetLatticeStats,
  };
}
