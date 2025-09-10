import * as kuzu from "kuzu";
import { hexString } from "@tkn/serializers";

export type PerplexityStep = {
  from: number[];
  to: number[];
  numerator: number;
  denominator: number;
  vocab: number;
  prob: number;
  logProb: number;
};

export type PerplexityResult = {
  transitions: number; // N = tokens.length - 1
  avgLogProb: number; // (Σ log P) / N
  perplexity: number; // exp(-avgLogProb)
  steps: PerplexityStep[];
};

type Options = {
  alpha?: number; // Laplace smoothing factor (default 0.1)
  epsilonFloor?: number; // tiny floor prob (default 1e-12)
};

// Calculates the perplexity of a sequence of tokens decoded using the ViterbiDecoder and the lattice in Kuzu.
export class PerplexityCalculator {
  private _db: kuzu.Database;
  private _conn: kuzu.Connection;
  private _stmt?: kuzu.PreparedStatement;
  private _corpusVocabSize: number;

  constructor(
    corpusVocabSize: number,
    database?: {
      instance?: kuzu.Database;
      path?: string;
    },
  ) {
    this._db =
      database?.instance ??
      new kuzu.Database(database?.path ?? ":memory:", undefined, undefined);
    this._conn = new kuzu.Connection(this._db);
    this._corpusVocabSize = corpusVocabSize;
  }

  async init(): Promise<void> {
    this._stmt = this._conn.prepareSync(`
      MATCH (from:Token)-[b:BEFORE]->(to:Token)
      WHERE from.blob = BLOB($fromBlob)
      RETURN
        sum(b.count) AS total,
        sum(CASE WHEN to.blob = BLOB($toBlob) THEN b.count ELSE 0 END) AS match,
        count(b) AS vocab
    `);
  }

  async compute(
    tokens: number[][],
    opts: Options = {},
  ): Promise<PerplexityResult> {
    if (!this._stmt) await this.init();

    const alpha = opts.alpha ?? 0.1;
    const eps = opts.epsilonFloor ?? 1e-12;

    const steps: PerplexityStep[] = [];
    let sumLog = 0;
    let N = 0;

    for (let i = 0; i < tokens.length - 1; i++) {
      const fromTok = tokens[i];
      const toTok = tokens[i + 1];

      const res = await this._conn.execute(this._stmt!, {
        fromBlob: hexString(fromTok),
        toBlob: hexString(toTok),
      });

      const rows = Array.isArray(res)
        ? res.flatMap((r) => r.getAllSync())
        : res.getAllSync();

      const total = Number(
        (rows[0]["total"] ?? 0) as unknown as bigint | number,
      );
      const match = Number(
        (rows[0]["match"] ?? 0) as unknown as bigint | number,
      );
      const vocab = Number(
        (rows[0]["vocab"] ?? 0) as unknown as bigint | number,
      );

      let prob: number;
      if (total === 0) {
        // Unseen token, so we use the global corpus vocabulary size
        prob = alpha / (0 + alpha * this._corpusVocabSize);
      } else {
        const denom = total + alpha * this._corpusVocabSize;
        prob = (match + alpha) / denom;
      }
      if (!(prob > 0)) prob = eps;

      const logProb = Math.log(prob);

      steps.push({
        from: fromTok.slice(),
        to: toTok.slice(),
        numerator: match,
        denominator: total,
        vocab,
        prob,
        logProb,
      });

      sumLog += logProb;
      N += 1;
    }

    const avgLogProb = N > 0 ? sumLog / N : Number.NaN;
    const perplexity = N === 0 ? Number.NaN : Math.exp(-avgLogProb);

    return { transitions: N, avgLogProb, perplexity, steps };
  }

  async close(): Promise<void> {
    await this._conn.close();
  }
}
