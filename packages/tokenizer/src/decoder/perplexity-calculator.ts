import { Database } from "bun:sqlite";
import { escapedHex } from "@tkn/serializers";

export type PerplexityStep = {
  from: number[];
  to: number[];
  numerator: number; // edge weight (match)
  denominator: number; // from.strength
  degree: number; // from.degree
  prob: number;
  logProb: number;
};

export type PerplexityResult = {
  transitions: number; // N = tokens.length - 1
  avgLogProb: number; // (Σ log P) / N
  perplexity: number; // exp(-avgLogProb)
  steps: PerplexityStep[];
  sumLog: number; // Σ log P
};

type Options = {
  alpha?: number; // Laplace smoothing factor (default 0.1)
  epsilonFloor?: number; // tiny floor prob (default 1e-12)
};

/**
 * Perplexity over a tokenized sequence using:
 *   Token(bytes TEXT UNIQUE, degree INTEGER, strength INTEGER)
 *   BEFORE(from_bytes TEXT, to_bytes TEXT, weight INTEGER, PK(from_bytes, to_bytes))
 *
 * Lookups bind escapedHex strings like "\\xBC\\xBD".
 */
export class PerplexityCalculator {
  private _db: Database;
  private _stmt?: ReturnType<Database["query"]>;
  private _corpusVocabSize: number | undefined;

  constructor({
    corpusVocabSize,
    database,
  }: {
    corpusVocabSize?: number;
    database?: { instance?: Database; path?: string };
  }) {
    this._db =
      database?.instance ??
      new Database(database?.path ?? ":memory:", { safeIntegers: false });

    // Sensible defaults for mixed read/write environments
    this._db.run("PRAGMA journal_mode = WAL;");
    this._db.run("PRAGMA synchronous = NORMAL;");
    this._db.run("PRAGMA foreign_keys = ON;");

    this._corpusVocabSize = corpusVocabSize;
  }

  init(): void {
    // Join Token (FROM node) with BEFORE edge (to get weight to $to)
    // If the edge doesn't exist, weight will be NULL -> treat as 0 in JS.
    this._stmt = this._db.query<
      { $from: string; $to: string },
      { strength: number; degree: number; match: number | null }
    >(`
      SELECT
        t.strength AS strength,
        t.degree   AS degree,
        b.weight   AS match
      FROM Token t
      LEFT JOIN BEFORE b
        ON b.from_bytes = t.bytes
       AND b.to_bytes   = $to
      WHERE t.bytes = $from
    `);
  }

  setCorpusVocabSize(size: number): void {
    this._corpusVocabSize = size;
  }

  /** Compute perplexity for a sequence of tokens (each token is number[] of bytes). */
  compute(tokens: number[][], opts: Options = {}): PerplexityResult {
    if (!this._stmt) this.init();
    if (!this._corpusVocabSize)
      throw new Error("Corpus vocabulary size is undefined");

    const alpha = opts.alpha ?? 0.1;
    const eps = opts.epsilonFloor ?? 1e-12;

    const steps: PerplexityStep[] = [];
    let sumLog = 0;
    let N = 0;

    for (let i = 0; i < tokens.length - 1; i++) {
      const fromTok = tokens[i];
      const toTok = tokens[i + 1];

      const fromEsc = escapedHex(fromTok);
      const toEsc = escapedHex(toTok);

      const row = (this._stmt!.get({ $from: fromEsc, $to: toEsc }) as
        | { strength: number; degree: number; match: number | null }
        | undefined) ?? { strength: 0, degree: 0, match: 0 };

      const strength = Number(row.strength ?? 0);
      const degree = Number(row.degree ?? 0);
      const match = Number(row.match ?? 0);

      // Laplace-smoothed conditional prob P(to | from)
      let prob: number;
      if (strength === 0) {
        // unseen "from" token: back off to uniform over vocab with smoothing
        prob = alpha / (0 + alpha * this._corpusVocabSize);
      } else {
        const denom = strength + alpha * this._corpusVocabSize;
        prob = (match + alpha) / denom;
      }
      if (!(prob > 0)) prob = eps;

      const logProb = Math.log(prob);

      steps.push({
        from: fromTok.slice(),
        to: toTok.slice(),
        numerator: match,
        denominator: strength,
        degree,
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

  close(): void {
    this._db.close(false);
  }
}
