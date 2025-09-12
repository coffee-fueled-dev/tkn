import { Database } from "bun:sqlite";
import { LRUCache } from "lru-cache";
import { bytesFromEscapedHex, escapedHex } from "@tkn/serializers";

const LOG_EPS = Math.log(1e-9);

export class Decoder {
  private _db: Database;

  // Prepared statements (escapedHex-based)
  private _stmtPrefix?: ReturnType<Database["query"]>;
  private _stmtTransitions?: ReturnType<Database["query"]>;

  // Caches
  private _transitionsCache = new Map<
    string,
    Array<{ esc: string; weight: number }>
  >();
  private _prefixLRU = new LRUCache<string, string[]>({ max: 512 });

  constructor({
    database,
  }: {
    database?: { instance?: Database; path?: string };
  }) {
    this._db =
      database?.instance ??
      new Database(database?.path ?? ":memory:", { safeIntegers: false });

    this._db.run("PRAGMA journal_mode = WAL;");
    this._db.run("PRAGMA synchronous = NORMAL;");
    this._db.run("PRAGMA foreign_keys = ON;");
  }

  init(): void {
    // PREFIX: Token.bytes is an escapedHex string; match if it equals the prefix of $esc
    // longest tokens first
    this._stmtPrefix = this._db.query<{ $esc: string }, { bytes: string }>(`
      SELECT bytes
      FROM Token
      WHERE bytes = substr($esc, 1, length(bytes))
      ORDER BY length(bytes) DESC
    `);

    // TRANSITIONS: BEFORE.from_bytes / to_bytes store escapedHex too
    this._stmtTransitions = this._db.query<
      { $from: string },
      { bytes: string; weight: number }
    >(`
      SELECT to_bytes AS bytes, weight
      FROM BEFORE
      WHERE from_bytes = $from
    `);
  }

  private keyForBytes(bytes: number[]): string {
    // cheap key for prefix-LRU; you can cap for very long inputs if desired
    return bytes.join(",");
  }

  /** Return candidate tokens as escapedHex strings (LRU-cached). */
  private findPrefixTokensEsc(inputBytes: number[]): string[] {
    if (!this._stmtPrefix) this.init();

    const lruKey = this.keyForBytes(inputBytes);
    const cached = this._prefixLRU.get(lruKey);
    if (cached) return cached;

    const esc = escapedHex(inputBytes);
    const rows = this._stmtPrefix!.all({ $esc: esc }) as Array<{
      bytes: string;
    }>;
    const tokens = rows.map((r) => r.bytes);

    // fallback: single byte token => first 4 chars, e.g. "\\xBC"
    const out = tokens.length ? tokens : [esc.slice(0, 4)];
    this._prefixLRU.set(lruKey, out);
    return out;
  }

  /** Transitions for previous token (escapedHex), memoized. */
  private transitionsFromEsc(
    prevEsc: string,
  ): Array<{ esc: string; weight: number }> {
    if (!this._stmtTransitions) this.init();

    const cached = this._transitionsCache.get(prevEsc);
    if (cached) return cached;

    const rows = this._stmtTransitions!.all({ $from: prevEsc }) as Array<{
      bytes: string;
      weight: number;
    }>;

    const list = rows.map((r) => ({ esc: r.bytes, weight: Number(r.weight) }));
    this._transitionsCache.set(prevEsc, list);
    return list;
  }

  /** Viterbi over escapedHex tokens. */
  decode(input: number[]): number[][] {
    if (!this._stmtPrefix || !this._stmtTransitions) this.init();

    // dp[i] = best log prob up to i
    // back[i] = [prevIndex, tokenEsc]
    const dp = new Map<number, number>();
    const back = new Map<number, [number, string]>();
    dp.set(0, 0);

    for (let i = 0; i < input.length; i++) {
      const prevProb = dp.get(i);
      if (prevProb === undefined) continue;

      const slice = input.slice(i);
      const candidatesEsc = this.findPrefixTokensEsc(slice);

      const prevEntry = back.get(i);
      const prevTokenEsc = prevEntry ? prevEntry[1] : null;

      let transitions: Array<{ esc: string; weight: number }> = [];
      let total = 0;
      if (prevTokenEsc) {
        transitions = this.transitionsFromEsc(prevTokenEsc);
        for (let k = 0; k < transitions.length; k++)
          total += transitions[k].weight;
      }

      for (const tokEsc of candidatesEsc) {
        const tokenLenBytes = tokEsc.length / 4; // each byte renders as 4 chars: \xHH
        const nextIndex = i + tokenLenBytes;

        let logP = 0; // baseline for first token
        if (prevTokenEsc) {
          const hit = transitions.find((t) => t.esc === tokEsc);
          logP = hit && total > 0 ? Math.log(hit.weight / total) : LOG_EPS;
        }

        const newProb = prevProb + logP;
        const cur = dp.get(nextIndex);
        if (cur === undefined || newProb > cur) {
          dp.set(nextIndex, newProb);
          back.set(nextIndex, [i, tokEsc]);
        }
      }
    }

    // reconstruct best path (fallback to farthest reachable index if needed)
    const out: number[][] = [];
    let idx = input.length;
    if (!back.has(idx)) {
      let best = -1;
      for (const k of back.keys()) if (k > best && k <= input.length) best = k;
      if (best > 0) idx = best;
    }
    while (idx > 0 && back.has(idx)) {
      const [pi, tokEsc] = back.get(idx)!;
      out.push(bytesFromEscapedHex(tokEsc));
      idx = pi;
    }
    out.reverse();
    return out;
  }

  close(): void {
    this._db.close(false);
  }
}
