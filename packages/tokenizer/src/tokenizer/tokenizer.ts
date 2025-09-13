import { LRUCache } from "lru-cache";
import { Hex } from "@tkn/serializers";
import type { Lattice } from "../lattice";

const LOG_EPS = Math.log(1e-9);

export type PerplexityStep = {
  from: number;
  to: number;
  prob: number;
  logProb: number;
};

export type PerplexityResult = {
  transitions: number;
  avgLogProb: number;
  perplexity: number;
  steps: PerplexityStep[];
  sumLog: number;
};

export class Tokenizer {
  private _lattice: Lattice;
  private _D = 0.75; // Kneser-Ney discount parameter

  // Caches
  private _transitionsCache = new Map<
    string,
    Array<{ esc: string; weight: number }>
  >();
  private _prefixLRU = new LRUCache<string, string[]>({ max: 512 });
  private _globalDistinctCache?: number;

  constructor(lattice: Lattice) {
    this._lattice = lattice;
  }

  private keyForBytes(bytes: number[]): string {
    // cheap key for prefix-LRU; you can cap for very long inputs if desired
    return bytes.join(",");
  }

  /** Return candidate tokens as escapedHex strings (LRU-cached). */
  private findPrefixTokensEsc(inputBytes: number[]): string[] {
    const lruKey = this.keyForBytes(inputBytes);
    const cached = this._prefixLRU.get(lruKey);
    if (cached) return cached;

    const esc = Hex.fromBytes(inputBytes);
    const tokens = this._lattice.prefixSearch(esc).map((r) => r.bytes);

    // fallback: single byte token => first 4 chars, e.g. "\\xBC"
    const out = tokens.length ? tokens : [esc.slice(0, 4)];
    this._prefixLRU.set(lruKey, out);
    return out;
  }

  /** Transitions for previous token (escapedHex), memoized. */
  private transitionsFromEsc(
    prevEsc: string
  ): Array<{ esc: string; weight: number }> {
    const cached = this._transitionsCache.get(prevEsc);
    if (cached) return cached;

    const rows = this._lattice.transitionsFrom(prevEsc) as Array<{
      bytes: string;
      weight: number;
    }>;

    const list = rows.map((r) => ({ esc: r.bytes, weight: Number(r.weight) }));
    this._transitionsCache.set(prevEsc, list);
    return list;
  }

  /** Set the Kneser-Ney discount parameter D (default: 0.75) */
  setDiscountParameter(D: number): void {
    this._D = Math.max(0, Math.min(1, D)); // clamp between 0 and 1
  }

  /** Get global distinct bigram count (cached) */
  private getGlobalDistinctCount(): number {
    if (this._globalDistinctCache === undefined) {
      const result = this._lattice.db
        .query<{ count: number }, []>(
          `SELECT COUNT(*) AS count FROM Edge WHERE weight > 0`
        )
        .get();
      this._globalDistinctCache = Number(result?.count ?? 1);
    }
    return this._globalDistinctCache;
  }

  /** Compute Kneser-Ney smoothed probability P(to | from) */
  private computeKneserNeyProb(fromEsc: string, toEsc: string): number {
    // Get edge statistics for the from-token
    const edgeData = this._lattice.getEdge({ from: fromEsc, to: toEsc });

    const c = Number(edgeData?.strength ?? 0); // total occurrences of 'from' token
    const T = Number(edgeData?.degree ?? 0); // distinct continuations from 'from'
    const r = Number(edgeData?.match ?? 0); // co-occurrence count of 'from' -> 'to'

    // Continuation probability: how many distinct predecessors does 'to' have?
    const nTo = this._lattice.countPredecessors(toEsc) ?? 0;
    const globalDistinct = this.getGlobalDistinctCount();
    const Pcont = nTo / (globalDistinct || 1);

    if (c <= 0) {
      // Back off fully to continuation probability
      return Pcont || 1e-12;
    }

    const D = this._D;
    const p_ml_discounted = Math.max(r - D, 0) / c;
    const lambda = (D * T) / c;

    return p_ml_discounted + lambda * (Pcont || 1e-12);
  }

  /** Compute perplexity using Kneser-Ney smoothing */
  computePerplexity(tokenIds: number[]): PerplexityResult {
    const steps: PerplexityStep[] = [];
    let sumLog = 0;
    let N = 0;

    for (let i = 0; i < tokenIds.length - 1; i++) {
      const fromId = tokenIds[i];
      const toId = tokenIds[i + 1];

      const fromToken = this._lattice.getTokenById(fromId);
      const toToken = this._lattice.getTokenById(toId);

      if (!fromToken || !toToken) continue;

      const prob = this.computeKneserNeyProb(fromToken.bytes, toToken.bytes);
      const logProb = Math.log(prob);

      steps.push({
        from: fromId,
        to: toId,
        prob,
        logProb,
      });

      sumLog += logProb;
      N += 1;
    }

    return {
      transitions: N,
      avgLogProb: N ? sumLog / N : NaN,
      perplexity: N ? Math.exp(-sumLog / N) : NaN,
      steps,
      sumLog,
    };
  }

  /** Get hex bytes from token ID */
  getTokenBytes(tokenId: number): number[] | null {
    const token = this._lattice.getTokenById(tokenId);
    return token ? Hex.toBytes(token.bytes) : null;
  }

  /** Viterbi over escapedHex tokens. */
  decode(input: string): number[] {
    const textEncoder = new TextEncoder();
    const bytes = [...textEncoder.encode(input)];
    // dp[i] = best log prob up to i
    // back[i] = [prevIndex, tokenEsc]
    const dp = new Map<number, number>();
    const back = new Map<number, [number, string]>();
    dp.set(0, 0);

    for (let i = 0; i < bytes.length; i++) {
      const prevProb = dp.get(i);
      if (prevProb === undefined) continue;

      const slice = bytes.slice(i);
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
    const out: number[] = [];
    let idx = bytes.length;
    if (!back.has(idx)) {
      let best = -1;
      for (const k of back.keys()) if (k > best && k <= bytes.length) best = k;
      if (best > 0) idx = best;
    }
    while (idx > 0 && back.has(idx)) {
      const [pi, tokEsc] = back.get(idx)!;
      const token = this._lattice.getTokenByBytes(tokEsc);
      if (token) {
        out.push(token.id);
      }
      idx = pi;
    }
    out.reverse();
    return out;
  }

  toStrings(tokenIds: number[]): string[] {
    const textDecoder = new TextDecoder();
    return tokenIds.map((id) =>
      textDecoder.decode(
        new Uint8Array(Hex.toBytes(this._lattice.getTokenById(id)?.bytes!))
      )
    );
  }
}
