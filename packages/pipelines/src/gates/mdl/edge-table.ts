import {
  ceilPow2,
  DEFAULT_EDGE_CAPACITY,
  hashPair,
  MAX_LOAD_FACTOR_Q8,
  U32_EMPTY,
} from "./libs";

/**
 * Open-addressed edge counter:
 * buckets store (prev, cur, count).
 * - prevs[i] = U32_EMPTY means empty bucket.
 * - Linear probing (super simple, branch-light).
 */
export class EdgeTable {
  private cap: number; // power-of-two
  private mask: number; // cap - 1
  private size: number; // number of occupied buckets
  private maxLoadQ8: number; // cap * loadFactor in Q8
  private prevs: Uint32Array;
  private curs: Uint32Array;
  private counts: Uint32Array;

  constructor(
    initCap = DEFAULT_EDGE_CAPACITY,
    maxLoadFactorQ8 = MAX_LOAD_FACTOR_Q8
  ) {
    this.cap = ceilPow2(Math.max(4, initCap));
    this.mask = this.cap - 1;
    this.size = 0;
    this.maxLoadQ8 = (this.cap * maxLoadFactorQ8) >>> 0;

    this.prevs = new Uint32Array(this.cap);
    this.curs = new Uint32Array(this.cap);
    this.counts = new Uint32Array(this.cap);
    this.prevs.fill(U32_EMPTY);
  }

  /** Find bucket index for (prev,cur), or insertion slot if absent. */
  private findSlot(prev: number, cur: number): number {
    let i = hashPair(prev, cur) & this.mask;
    for (; ; i = (i + 1) & this.mask) {
      const p = this.prevs[i];
      if (p === U32_EMPTY) return i; // empty slot
      if (p === prev && this.curs[i] === cur) return i; // match
    }
  }

  /** Rehash to a larger table when load factor is exceeded. */
  private rehash(newCap: number) {
    const oldPrevs = this.prevs,
      oldCurs = this.curs,
      oldCounts = this.counts;
    const oldCap = this.cap;

    this.cap = ceilPow2(newCap);
    this.mask = this.cap - 1;
    this.size = 0;
    this.maxLoadQ8 = (this.cap * MAX_LOAD_FACTOR_Q8) >>> 0;

    this.prevs = new Uint32Array(this.cap);
    this.curs = new Uint32Array(this.cap);
    this.counts = new Uint32Array(this.cap);
    this.prevs.fill(U32_EMPTY);

    for (let i = 0; i < oldCap; i++) {
      const p = oldPrevs[i];
      if (p !== U32_EMPTY) {
        const c = oldCurs[i];
        const cnt = oldCounts[i];
        let j = hashPair(p, c) & this.mask;
        for (; ; j = (j + 1) & this.mask) {
          if (this.prevs[j] === U32_EMPTY) {
            this.prevs[j] = p;
            this.curs[j] = c;
            this.counts[j] = cnt;
            this.size++;
            break;
          }
        }
      }
    }
  }

  /**
   * Increment edge count for (prev,cur).
   * @returns true if this was the first time we saw this edge (i.e., a new child under prev).
   */
  inc(prev: number, cur: number): boolean {
    // grow if load factor exceeded
    if ((this.size << 8) >>> 0 >= this.maxLoadQ8) {
      this.rehash(this.cap << 1);
    }
    const i = this.findSlot(prev, cur);
    if (this.prevs[i] === U32_EMPTY) {
      this.prevs[i] = prev >>> 0;
      this.curs[i] = cur >>> 0;
      this.counts[i] = 1;
      this.size++;
      return true; // brand-new edge
    }
    // existing edge
    this.counts[i] = (this.counts[i] + 1) >>> 0;
    return false;
  }

  /** Get edge count for (prev,cur) */
  get(prev: number, cur: number): number {
    const i = this.findSlot(prev, cur);
    return this.prevs[i] === U32_EMPTY ? 0 : this.counts[i];
  }

  reset() {
    this.prevs.fill(U32_EMPTY);
    this.curs.fill(0);
    this.counts.fill(0);
    this.size = 0;
  }
}
