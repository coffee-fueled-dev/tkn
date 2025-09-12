import { Database } from "bun:sqlite";
import { AdjacencyStore } from "./adjacency-store";
import {
  TokenCache,
  type DatabaseToken,
  type ITokenCache,
} from "@tkn/token-cache";

export type Pair = {
  from: string;
  to: string;
  weight: number;
};

type SqliteTokenRow = {
  index: number;
  bytes: string; // hex
  degree: number;
  strength: number;
};

export class Ingest {
  private _db: Database;
  private readonly _batchSize: number;
  private _adjacencyStore = new AdjacencyStore();
  private _tokenCache: ITokenCache;
  private _tokenBuffer: string[] = [];

  // prepared statements
  private _insertTokenStmt?: ReturnType<Database["query"]>;
  private _upsertEdgeStmt?: ReturnType<Database["query"]>;

  constructor({
    batchSize = 1000,
    database,
    cache,
  }: {
    cache: { size?: number; strategy?: ITokenCache };
    database?: { instance?: Database; path?: string };
    batchSize: number;
  }) {
    this._db =
      database?.instance ??
      new Database(database?.path ?? ":memory:", {
        safeIntegers: false,
      });

    // Fast, sane defaults
    this._db.run("PRAGMA journal_mode = WAL;");
    this._db.run("PRAGMA synchronous = NORMAL;");
    this._db.run("PRAGMA foreign_keys = ON;");

    this._batchSize = Math.max(1, batchSize);
    this._tokenCache = cache.strategy ?? new TokenCache(cache.size ?? 10_000);
  }

  init() {
    // Schema
    this._db.run(`
      CREATE TABLE IF NOT EXISTS Token (
        idx       INTEGER PRIMARY KEY AUTOINCREMENT,
        bytes     TEXT UNIQUE NOT NULL,
        degree    INTEGER NOT NULL DEFAULT 0,
        strength  INTEGER NOT NULL DEFAULT 0
      );
    `);

    this._db.run(`
      CREATE TABLE IF NOT EXISTS BEFORE (
        from_bytes TEXT NOT NULL,
        to_bytes   TEXT NOT NULL,
        weight     INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (from_bytes, to_bytes),
        FOREIGN KEY (from_bytes) REFERENCES Token(bytes) ON DELETE CASCADE,
        FOREIGN KEY (to_bytes)   REFERENCES Token(bytes) ON DELETE CASCADE
      );
    `);

    // Indexes (keep the UNIQUE on Token.bytes for upsert)
    this._db.run(`CREATE INDEX IF NOT EXISTS idx_token_bytes ON Token(bytes);`);
    this._db.run(
      `CREATE INDEX IF NOT EXISTS idx_before_from_to ON BEFORE(from_bytes, to_bytes);`,
    );

    // Prepared statements
    this._insertTokenStmt = this._db.query<
      { $bytes: string; $degree: number; $strength: number },
      SqliteTokenRow
    >(`
      INSERT INTO Token (bytes, degree, strength)
      VALUES ($bytes, $degree, $strength)
      ON CONFLICT(bytes) DO UPDATE SET
        degree   = degree   + excluded.degree,
        strength = strength + excluded.strength
      RETURNING idx as 'index', bytes, degree, strength;
    `);

    this._upsertEdgeStmt = this._db.query<
      { $from: string; $to: string; $weight: number },
      { changes: number }
    >(`
      INSERT INTO BEFORE (from_bytes, to_bytes, weight)
      VALUES ($from, $to, $weight)
      ON CONFLICT(from_bytes, to_bytes) DO UPDATE SET
        weight = weight + excluded.weight;
    `);
  }

  /** Buffer a token (hex string). Commits when the buffer reaches batchSize. */
  enqueueToken(hexBytes: string): void {
    this._tokenBuffer.push(hexBytes);
    if (this._tokenBuffer.length >= this._batchSize) {
      this.commitBatchOf(this._batchSize);
    }
  }

  /** Commit up to `size` buffered tokens, merging token + edge writes in a single transaction. */
  private commitBatchOf(size: number = this._batchSize): void {
    if (!this._insertTokenStmt || !this._upsertEdgeStmt) this.init();

    const distinctTokens = new Set<string>();
    const batch = this._tokenBuffer.splice(0, size);

    // Build adjacency over the batch
    for (let i = 0; i + 1 < batch.length; i++) {
      const tFrom = batch[i];
      const tTo = batch[i + 1];
      this._adjacencyStore.increment(tFrom, tTo);
      distinctTokens.add(tFrom);
      distinctTokens.add(tTo);
    }

    // Claim counts
    const claimed = [...distinctTokens].map((from) =>
      this._adjacencyStore.claim(from),
    );

    // Prepare rows
    const tokens: DatabaseToken[] = claimed.map(([bytes, adj]) => ({
      bytes,
      degree: adj ? adj.size : 0,
      strength: adj ? [...adj.values()].reduce((a, b) => a + b, 0) : 0,
    }));

    const edges: Pair[] = claimed
      .filter(([, adj]) => adj && adj.size > 0)
      .flatMap(([bytes, adj]) =>
        [...adj!.entries()].map(([toBytes, weight]) => ({
          from: bytes,
          to: toBytes,
          weight,
        })),
      );

    // Single transaction for both tokens & edges
    const commitTx = this._db.transaction(
      (tokenRows: DatabaseToken[], edgeRows: Pair[]) => {
        for (const t of tokenRows) {
          const res = this._insertTokenStmt!.get({
            $bytes: t.bytes,
            $degree: t.degree ?? 0,
            $strength: t.strength ?? 0,
          }) as SqliteTokenRow | undefined;

          if (res) {
            const mapped: DatabaseToken = {
              index: res.index,
              bytes: res.bytes,
              degree: res.degree,
              strength: res.strength,
            };
            this._tokenCache.patch(mapped.bytes, mapped);
          }
        }

        for (const e of edgeRows) {
          this._upsertEdgeStmt!.run({
            $from: e.from,
            $to: e.to,
            $weight: e.weight,
          });
        }
      },
    );

    commitTx(tokens, edges);
  }

  /** Force a final synchronous commit for any remaining buffered tokens. */
  flush(): void {
    if (this._tokenBuffer.length) {
      this.commitBatchOf(this._tokenBuffer.length);
    }
  }

  /** Close the DB after flushing. */
  close(): void {
    this.flush();
    this._db.close(false);
  }

  get connection(): Database {
    return this._db;
  }
}
