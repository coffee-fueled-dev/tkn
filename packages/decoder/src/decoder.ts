import * as kuzu from "kuzu";
import { hexString } from "@tkn/serializers";
import { LRUCache } from "lru-cache";

/** Log of small epsilon for unseen transitions */
const LOG_EPS = Math.log(1e-9);

/**
 * Decoder using Viterbi over BEFORE(bigram) transitions in Kuzu.
 * - DB prefix search via list_slice($input, 1, size(t.data)) = t.data
 * - Transitions memoized by previous token hex
 */
export class Decoder {
  private _db: kuzu.Database;
  private _conn: kuzu.Connection;

  // Prepared statements
  private _stmtPrefix?: kuzu.PreparedStatement;
  private _stmtTransitions?: kuzu.PreparedStatement;

  // Caches
  private _transitionsCache = new Map<
    string,
    Array<{ data: number[]; count: number }>
  >();
  private _prefixLRU = new LRUCache<string, number[][]>({ max: 512 });

  constructor(database?: { instance?: kuzu.Database; path?: string }) {
    this._db =
      database?.instance ??
      new kuzu.Database(database?.path ?? ":memory:", undefined, undefined);
    this._conn = new kuzu.Connection(this._db);
  }

  async init(): Promise<void> {
    // Prefix match: token.data must equal the prefix of $inputData of the same length.
    // Kuzu list indices are 1-based; end index is inclusive.
    this._stmtPrefix = this._conn.prepareSync(`
      MATCH (t:Token)
      WHERE size(t.data) <= size($inputData)
        AND list_slice($inputData, 1, size(t.data)) = t.data
      RETURN t.data AS data
      ORDER BY size(t.data) DESC
    `);

    this._stmtTransitions = this._conn.prepareSync(`
      MATCH (tFrom:Token)-[b:BEFORE]->(tTo:Token)
      WHERE tFrom.blob = BLOB($tFromBlob)
      RETURN tTo.data AS data, b.count AS count
    `);
  }

  private keyForBytes(bytes: number[]): string {
    // serialize slice to a compact string key (enough for LRU of prefix results)
    // For very long slices, you can cap length (e.g., first 64 bytes) if needed:
    // const view = bytes.length > 64 ? bytes.slice(0, 64) : bytes;
    const view = bytes;
    return view.join(",");
  }

  /** DB-side prefix query with small LRU memoization. */
  private async findPrefixTokens(input: number[]): Promise<number[][]> {
    if (!this._stmtPrefix) await this.init();

    const key = this.keyForBytes(input);
    const cached = this._prefixLRU.get(key);
    if (cached) return cached;

    const res = await this._conn.execute(this._stmtPrefix!, {
      inputData: input,
    });
    const rows: Record<string, kuzu.KuzuValue>[] = Array.isArray(res)
      ? res.flatMap((r) => r.getAllSync())
      : res.getAllSync();

    const tokens = rows.map((r) => r["data"] as unknown as number[]);
    // Always allow progress: if nothing matched, fall back to a single byte
    const out = tokens.length ? tokens : [input.slice(0, 1)];
    this._prefixLRU.set(key, out);
    return out;
  }

  /** Memoized transitions for prev token (by hex key). */
  private async transitionsFrom(
    prevToken: number[],
  ): Promise<Array<{ data: number[]; count: number }>> {
    if (!this._stmtTransitions) await this.init();

    const prevHex = hexString(prevToken);
    const cached = this._transitionsCache.get(prevHex);
    if (cached) return cached;

    const res = await this._conn.execute(this._stmtTransitions!, {
      tFromBlob: prevHex,
    });
    const rows: Record<string, kuzu.KuzuValue>[] = Array.isArray(res)
      ? res.flatMap((r) => r.getAllSync())
      : res.getAllSync();

    const list = rows.map((r) => ({
      data: r["data"] as unknown as number[],
      count: Number(r["count"] as unknown as bigint | number),
    }));
    this._transitionsCache.set(prevHex, list);
    return list;
  }

  /**
   * Viterbi tokenization over the input bytes.
   * dp[i] = best log prob up to i, back[i] = [prevIndex, token]
   */
  async tokenize(input: number[]): Promise<number[][]> {
    if (!this._stmtPrefix || !this._stmtTransitions) await this.init();

    const dp = new Map<number, number>();
    const back = new Map<number, [number, number[]]>();
    dp.set(0, 0);

    for (let i = 0; i < input.length; i++) {
      const prevProb = dp.get(i);
      if (prevProb === undefined) continue;

      const slice = input.slice(i);
      const candidates = await this.findPrefixTokens(slice);

      const prevEntry = back.get(i);
      const prevToken = prevEntry ? prevEntry[1] : null;

      let transitions: Array<{ data: number[]; count: number }> = [];
      let total = 0;
      if (prevToken) {
        transitions = await this.transitionsFrom(prevToken);
        total = transitions.reduce((s, t) => s + t.count, 0);
      }

      for (const token of candidates) {
        const nextIndex = i + token.length;
        let logP = 0; // first token baseline
        if (prevToken) {
          const hit = transitions.find((t) => {
            // cheap comparision without hex: lengths first, then byte-equal
            if (t.data.length !== token.length) return false;
            for (let j = 0; j < token.length; j++)
              if (t.data[j] !== token[j]) return false;
            return true;
          });
          logP = hit && total > 0 ? Math.log(hit.count / total) : LOG_EPS;
        }

        const newProb = prevProb + logP;
        const cur = dp.get(nextIndex);
        if (cur === undefined || newProb > cur) {
          dp.set(nextIndex, newProb);
          back.set(nextIndex, [i, token]);
        }
      }
    }

    // reconstruct best path (fallback to farthest reachable index if needed)
    const path: number[][] = [];
    let idx = input.length;
    if (!back.has(idx)) {
      let best = -1;
      for (const k of back.keys()) if (k > best && k <= input.length) best = k;
      if (best > 0) idx = best;
    }
    while (idx > 0 && back.has(idx)) {
      const [pi, tok] = back.get(idx)!;
      path.push(tok);
      idx = pi;
    }
    path.reverse();
    return path;
  }

  async close(): Promise<void> {
    await this._conn.close();
  }
}
