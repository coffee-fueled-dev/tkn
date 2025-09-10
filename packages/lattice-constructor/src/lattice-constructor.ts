import * as kuzu from "kuzu";
import Queue from "queue";
import { AdjacencyStore } from "./adjacency-store";
import { hexString } from "@tkn/serializers";

type TokenNode = {
  blob: string;
  data: number[];
};

type AdjacencyData = {
  from: TokenNode;
  to: TokenNode;
  count: number;
};

// Ingests outputs from LZS and builds a lattice in Kuzu from them
export class LatticeConstructor {
  private _adjacencyStore = new AdjacencyStore();
  private _sink: number[][] = [];
  private _writeQueue: number[][] = []; // queue of "from" byte arrays to claim

  private _db: kuzu.Database;
  private _conn: kuzu.Connection;

  // serialize DB operations and autostart them
  private _operationQueue = new Queue({ concurrency: 1, autostart: true });
  private _insertStmt?: kuzu.PreparedStatement;

  private readonly _batchSize: number;

  constructor(
    database?: {
      instance?: kuzu.Database;
      path?: string;
    },
    batchSize = 200,
  ) {
    this._db =
      database?.instance ??
      new kuzu.Database(database?.path ?? ":memory:", undefined, undefined);
    this._conn = new kuzu.Connection(this._db);
    this._batchSize = Math.max(1, batchSize);
  }

  /**
   * Initializes the Kuzu database schema and prepares statements.
   */
  async init(): Promise<void> {
    await this._conn.query(
      "CREATE NODE TABLE IF NOT EXISTS Token(blob BLOB PRIMARY KEY, data UINT8[], id SERIAL)",
    );
    await this._conn.query(
      "CREATE REL TABLE IF NOT EXISTS BEFORE(FROM Token TO Token, count UINT64)",
    );

    this._insertStmt = await this._conn.prepare(`
      UNWIND $pairs AS row
      MERGE (tFrom:Token { blob: BLOB(row.from.blob) })
        ON CREATE SET tFrom.data = row.from.data
        ON MATCH  SET tFrom.data = row.from.data
      MERGE (tTo:Token { blob: BLOB(row.to.blob) })
        ON CREATE SET tTo.data = row.to.data
        ON MATCH  SET tTo.data = row.to.data
      MERGE (tFrom)-[b:BEFORE]->(tTo)
      SET b.count = COALESCE(b.count, 0) + COALESCE(row.count, 1)
    `);
  }

  /**
   * Enqueues a token from your stream. Creates edges between consecutive tokens.
   */
  async enqueueToken(token: number[]): Promise<void> {
    this._sink.push(token);

    if (this._sink.length >= 2) {
      const from = this._sink.shift()!; // previous token
      const to = this._sink[0]!; // current token

      // Accumulate adjacency count in store
      this._adjacencyStore.increment(from, to);

      // Schedule claim for "from" when we flush
      this._writeQueue.push(from);

      // Flush by size
      if (this._writeQueue.length >= this._batchSize) {
        await this.flushBatchOf(this._batchSize);
      }
    }
  }

  /**
   * Flush any remaining queued "from" keys right now (useful before awaiting .idle/.close()).
   */
  async flush(): Promise<void> {
    if (this._writeQueue.length) {
      await this.flushBatchOf(this._writeQueue.length);
    }
  }

  /**
   * Wait until all queued DB writes have completed.
   */
  async idle(): Promise<void> {
    // If nothing pending, resolve immediately
    // @ts-expect-error queue typings: 'pending' is a runtime property
    if (this._operationQueue.length === 0 && this._operationQueue.pending === 0)
      return;

    await new Promise<void>((resolve, reject) => {
      const onEnd = () => {
        cleanup();
        resolve();
      };
      const onError = (err: any) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        this._operationQueue.removeEventListener("end", onEnd);
        this._operationQueue.removeEventListener("error", onError);
      };
      this._operationQueue.addEventListener("end", onEnd);
      this._operationQueue.addEventListener("error", onError);
    });
  }

  /**
   * Flush, wait for all work to finish, then close the Kuzu connection.
   */
  async close(): Promise<void> {
    await this.flush();
    await this.idle();
    await this._conn.close();
  }

  /**
   * Internal: claim up to `n` "from" tokens, build a pairs batch, and enqueue one DB write.
   */
  private async flushBatchOf(n: number): Promise<void> {
    const keys = this._writeQueue.splice(0, n);
    const pairs: AdjacencyData[] = [];

    for (const tFrom of keys) {
      const toMap = this._adjacencyStore.claim(tFrom);
      if (!toMap) continue;

      const fromBlob = hexString(tFrom);
      toMap.forEach(({ count, data: toData }) => {
        pairs.push({
          from: { blob: fromBlob, data: tFrom.slice() },
          to: { blob: hexString(toData), data: toData.slice() },
          count,
        });
      });
    }

    if (pairs.length) {
      this._operationQueue.push(async () => {
        await this.insertBatch(pairs);
      });
    }
  }

  private async insertBatch(pairs: AdjacencyData[]) {
    if (!this._insertStmt)
      throw new Error(
        "LatticeConstructor.init() must be called before inserts.",
      );
    try {
      await this._conn.execute(this._insertStmt, { pairs });
    } catch (error) {
      console.error("Error inserting batch:", error);
      // TODO: add retry/backoff if needed
    }
  }

  get connection(): kuzu.Connection {
    return this._conn;
  }
}
