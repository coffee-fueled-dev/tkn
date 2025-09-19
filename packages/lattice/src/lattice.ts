import { Base2p21 } from "./base-2p21";
import { LRUGraph } from "./graph.ts";
import type { ILattice } from "./lattice.domain.ts";

export class Lattice implements ILattice {
  private readonly _NEG_INF = -1e300;
  private _logEps = Math.log(1e-9);

  // Helper method to decode token ids to integers
  ints = (tokens: bigint[]) => tokens.map(Base2p21.decode);

  private readonly _graph = new LRUGraph({ max: 50_000 });

  merge = (origin: number[], terminal: number[], weight: number = 1) => {
    // TODO: Invalidate on interval rather than every time
    this._graph.invalidate();
    this._graph.merge(origin, terminal, weight);
  };

  tokens(sequence: number[]): bigint[];
  tokens(sequence: number[], as: "ids"): bigint[];
  tokens(sequence: number[], as: "sequences"): number[][];
  tokens(sequence: number[], as: "ids" | "sequences" = "ids") {
    const ids = this._tokens(sequence);
    if (as === "ids") return ids;
    return this.ints(ids);
  }

  private _tokens(
    sequence: number[],
    _as: "ids" | "sequences" = "ids"
  ): bigint[] {
    const N = sequence.length;

    const dp = new Float64Array(N + 1);
    dp.fill(this._NEG_INF);
    dp[0] = 0;

    const bpTokIdx = new Int32Array(N + 1);
    const bpPrev = new Int32Array(N + 1);
    const bpLen = new Int32Array(N + 1);
    bpTokIdx.fill(-1);
    bpPrev.fill(-1);
    bpLen.fill(-1);

    const csr = this._graph.csr();
    const nodePot = this._graph.nodePotentials();
    const logEps = this._logEps;

    for (let i = 0; i < N; i++) {
      const prevScore = dp[i];
      if (prevScore === this._NEG_INF) continue;

      this._graph.search(sequence, i, (tokenId, sequenceLength) => {
        const j = i + sequenceLength;

        const tokIdx = this._graph.toDenseIndex(tokenId) ?? -1;
        if (tokIdx < 0) return;

        let logP = 0.0;
        const prevTokIdx = bpTokIdx[i];

        if (prevTokIdx >= 0) {
          const r0 = csr.rowPtr[prevTokIdx] | 0;
          const r1 = csr.rowPtr[prevTokIdx + 1] | 0;
          let found = false;
          for (let k = r0; k < r1; k++) {
            if ((csr.colIdx[k] | 0) === tokIdx) {
              logP = csr.logW[k];
              found = true;
              break;
            }
          }
          if (!found) logP = logEps;
        }

        const score = prevScore + logP + (nodePot[tokIdx] ?? 0);

        if (score > dp[j]) {
          dp[j] = score;
          bpTokIdx[j] = tokIdx;
          bpPrev[j] = i;
          bpLen[j] = sequenceLength;
        } else if (
          Math.abs(score - dp[j]) <= 1e-12 &&
          sequenceLength > (bpLen[j] | 0)
        ) {
          bpTokIdx[j] = tokIdx;
          bpPrev[j] = i;
          bpLen[j] = sequenceLength;
        }
      });
    }

    // prefer full coverage; else best partial
    let end = N;
    if (bpPrev[end] < 0) {
      let best = 0,
        bestScore = this._NEG_INF;
      for (let i = 0; i <= N; i++) {
        const sc = dp[i];
        if (sc > bestScore || (sc === bestScore && i > best)) {
          bestScore = sc;
          best = i;
        }
      }
      end = best;
    }

    // Reconstruct token sequence using backpointers
    const tokens: bigint[] = [];
    let idx = end;
    while (idx > 0 && bpPrev[idx] >= 0) {
      const tokenId = this._graph.toTokenId(bpTokIdx[idx] | 0);
      if (tokenId !== undefined) {
        tokens.unshift(tokenId);
      }
      idx = bpPrev[idx] | 0;
    }
    return tokens;
  }
}
