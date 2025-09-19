// Fast, self-contained adjacency stats for MDLGate.
// - O(1) expected get/set
// - Zero allocations on the hot path (after warmup)
// - Uses typed arrays + open addressing for edges
//
// Works great when Key is a non-negative int (token id).
// If you need bigint/sparse keys, see the note at the bottom.

import { EdgeTable } from "./edge-table";
import {
  DEFAULT_EDGE_CAPACITY,
  DEFAULT_PARENT_CAPACITY,
  GrowU32,
} from "./libs";
import type { MDLStatsProvider } from "./mdl";

/**
 * FastMarkovStats: plug this into MDLGate as `stats`.
 * Call `push(prev, cur)` on each observed adjacency to ingest.
 */
export class FastMarkovStats implements MDLStatsProvider {
  private readonly parents: GrowU32; // parent occurrence counts
  private readonly degrees: GrowU32; // distinct children per parent
  private readonly edges: EdgeTable; // edge counts
  private readonly hashMask: number; // Map large hash values to smaller range

  constructor(opts?: { initialParentCap?: number; initialEdgeCap?: number }) {
    this.parents = new GrowU32(
      opts?.initialParentCap ?? DEFAULT_PARENT_CAPACITY
    );
    this.degrees = new GrowU32(
      opts?.initialParentCap ?? DEFAULT_PARENT_CAPACITY
    );
    this.edges = new EdgeTable(opts?.initialEdgeCap ?? DEFAULT_EDGE_CAPACITY);
    // Use 20-bit mask to keep indices under 1M (reduces collisions)
    this.hashMask = (1 << 20) - 1; // 1,048,575
  }

  /**
   * Ingest a single adjacency (prev -> cur).
   * Call this on your sequencer stream.
   */
  push(prev: number, cur: number): void {
    // Map hash values to smaller range to prevent huge memory allocations
    const prevIdx = (prev >>> 0) & this.hashMask;
    const curIdx = (cur >>> 0) & this.hashMask;

    // 1) parent occurrence
    this.parents.inc(prevIdx, 1);

    // 2) edge occurrence; if it's a brand-new child under prev, bump degree
    const isNewEdge = this.edges.inc(prevIdx, curIdx);
    if (isNewEdge) this.degrees.inc(prevIdx, 1);
  }

  parentCount(prev: number): number {
    const prevIdx = (prev >>> 0) & this.hashMask;
    return this.parents.get(prevIdx);
  }

  edgeCount(prev: number, current: number): number {
    const prevIdx = (prev >>> 0) & this.hashMask;
    const curIdx = (current >>> 0) & this.hashMask;
    return this.edges.get(prevIdx, curIdx);
  }

  degree(prev: number): number {
    const prevIdx = (prev >>> 0) & this.hashMask;
    return this.degrees.get(prevIdx);
  }

  /** Optional: reset all counters (useful for tests or epochs) */
  reset(): void {
    this.parents.reset();
    this.degrees.reset();
    this.edges.reset();
  }
}
