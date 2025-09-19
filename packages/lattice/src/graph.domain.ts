import { LRUCache } from "lru-cache";
import { RadixTrie } from "./radix-trie";

interface TransitionsCSR {
  rowPtr: Int32Array; // length = numTokens + 1
  colIdx: Int32Array; // length = numEdges (dest token indices)
  logW: Float64Array; // length = numEdges (row-normalized log-probs)
}

export class Edges extends Map<bigint, number> {}

export interface IGraph extends LRUCache<bigint, Edges> {
  /**
   * Invalidate all caches tied to structure and indexing
   */
  invalidate(): void;

  search: RadixTrie["findPrefixes"];

  merge: (origin: number[], terminal: number[], weight: number) => void;

  nodePotentials: (alpha: number) => Float64Array;

  toDenseIndex: (tokenId: bigint) => number | undefined;

  toTokenId: (denseIndex: number) => bigint | undefined;

  csr: () => TransitionsCSR;
}
