import { LRUCache } from "lru-cache";
import { KeyGenerator } from "../../sequencer/src/key-generator";
import { Base2p21 } from "./base-2p21";
import { RadixTrie } from "./radix-trie";
import type { IGraph } from "./graph.domain";

export class Edges extends Map<bigint, number> {}

export class LRUGraph extends LRUCache<bigint, Edges> implements IGraph {
  readonly _trie = new RadixTrie();
  readonly _keyGenerator = new KeyGenerator();
  private _csrCache: TransitionsCSR | undefined;
  private _nodePotentialsCache: Float64Array | undefined;

  // Cache the dense indexing used by CSR + node potentials
  private _idToIdxCache: Map<bigint, number> | undefined;

  /**
   * Keep a dynamic count via size getter of LRUCache
   */
  private get _numTokens() {
    return this.size;
  }

  private static _initEdges = (terminal?: { id: bigint; weight?: number }) =>
    terminal ? new Edges().set(terminal.id, terminal.weight ?? 1) : new Edges();

  private _visitEdges = (
    cb: (origin: bigint, terminal: bigint, weight: number) => void
  ) => {
    for (const [origin, outgoing] of this) {
      for (const [terminal, weight] of outgoing) cb(origin, terminal, weight);
    }
  };

  /**
   * Assign / reuse a dense index per node in current iteration order.
   * Shared by CSR + nodePotentials to guarantee alignment.
   */
  private _ensureDenseIndexing(): Map<bigint, number> {
    if (this._idToIdxCache) return this._idToIdxCache;
    const idToIdx = new Map<bigint, number>();
    let i = 0;
    for (const [node] of this) idToIdx.set(node, i++);
    this._idToIdxCache = idToIdx;
    return idToIdx;
  }

  /**
   * Invalidate all caches tied to structure and indexing
   */
  invalidate = () => {
    this._csrCache = undefined;
    this._nodePotentialsCache = undefined;
    this._idToIdxCache = undefined;
  };

  search = this._trie.findPrefixes;

  merge = (origin: number[], terminal: number[], weight: number = 1) => {
    const idO = Base2p21.encode(origin);
    const idT = Base2p21.encode(terminal);
    this._trie.insert(origin, idO);
    this._trie.insert(terminal, idT);

    const outgoing = super.get(idO);
    const currentWeight = outgoing?.get(idT);

    if (!currentWeight || !outgoing) {
      super.set(
        idO,
        LRUGraph._initEdges({
          id: idT,
          weight,
        })
      );
    } else {
      outgoing.set(idT, currentWeight + weight);
    }

    if (!super.has(idT)) {
      super.set(idT, LRUGraph._initEdges());
    }

    // Structure changed -> invalidate caches
    this.invalidate();
  };

  csr = () => {
    if (this._csrCache) return this._csrCache;
    const idToIdx = this._ensureDenseIndexing();
    this._csrCache = buildCSR(this, idToIdx);
    return this._csrCache;
  };

  /**
   * Unigram node log-potentials with add-α smoothing,
   * aligned to the same dense indexing used by CSR.
   */
  nodePotentials = (alpha = 0.1) => {
    if (this._nodePotentialsCache) return this._nodePotentialsCache;

    const idToIdx = this._ensureDenseIndexing();
    const V = this._numTokens;
    const counts = new Float64Array(V);

    // Count terminal occurrences (weight sum)
    this._visitEdges((_o, t, w) => {
      const idx = idToIdx.get(t);
      if (idx != null) counts[idx] += w;
    });

    let total = 0;
    for (let i = 0; i < V; i++) total += counts[i];

    const denom = total + alpha * V;
    const nodePot = new Float64Array(V);
    for (let i = 0; i < V; i++) {
      const p = (counts[i] + alpha) / denom;
      nodePot[i] = Math.log(p);
    }

    this._nodePotentialsCache = nodePot;
    return this._nodePotentialsCache;
  };

  /**
   * Convert token ID to dense index used by CSR and node potentials.
   * Returns undefined if token ID is not in the graph.
   */
  toDenseIndex = (tokenId: bigint): number | undefined => {
    const idToIdx = this._ensureDenseIndexing();
    return idToIdx.get(tokenId);
  };

  /**
   * Convert dense index back to token ID.
   * Uses iteration order to reconstruct the mapping.
   */
  toTokenId = (denseIndex: number): bigint | undefined => {
    let i = 0;
    for (const [tokenId] of this) {
      if (i === denseIndex) return tokenId;
      i++;
    }
    return undefined;
  };
}

interface TransitionsCSR {
  rowPtr: Int32Array; // length = numTokens + 1
  colIdx: Int32Array; // length = numEdges (dest token indices)
  logW: Float64Array; // length = numEdges (row-normalized log-probs)
}

/**
 * Build CSR over the graph using a provided dense mapping.
 * Ensures alignment with nodePotentials().
 */
const buildCSR = (
  graph: LRUGraph,
  idToIdx: Map<bigint, number>
): TransitionsCSR => {
  const numTokens = idToIdx.size;

  // --- Pass 1: rowPtr + edge count
  let totalEdges = 0;
  const rowPtr = new Int32Array(numTokens + 1);
  {
    let row = 0;
    for (const [_node, edges] of graph) {
      rowPtr[row] = totalEdges;
      totalEdges += edges.size;
      row += 1;
    }
    rowPtr[numTokens] = totalEdges;
  }

  // --- Pass 2: fill colIdx/logW and row-normalize ---
  const colIdx = new Int32Array(totalEdges);
  const logW = new Float64Array(totalEdges);

  const rowNormalize = (start: number, end: number) => {
    if (end <= start) return;
    let m = -Infinity;
    for (let k = start; k < end; k++) if (logW[k] > m) m = logW[k];
    if (!Number.isFinite(m)) return; // all -Inf; leave as-is
    let sum = 0;
    for (let k = start; k < end; k++) sum += Math.exp(logW[k] - m);
    const lse = m + Math.log(sum);
    for (let k = start; k < end; k++) logW[k] -= lse; // exp(row) sums to 1
  };

  {
    let write = 0;
    for (const [_origin, edges] of graph) {
      const start = write;

      for (const [terminal, weight] of edges) {
        const dst = idToIdx.get(terminal);
        if (dst == null) continue; // should not happen since we index all nodes
        colIdx[write] = dst | 0;
        logW[write] = Math.log(weight);
        write += 1;
      }

      rowNormalize(start, write);
    }
  }

  return { rowPtr, colIdx, logW };
};
