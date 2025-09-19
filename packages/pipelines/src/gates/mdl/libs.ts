/** Internal helpers */
export const U32_EMPTY = 0xffffffff >>> 0; // sentinel "empty" for Uint32Array slots
export const DEFAULT_EDGE_CAPACITY = 1 << 16; // 65,536 buckets to start
export const DEFAULT_PARENT_CAPACITY = 1 << 12; // 4096 parents to start
export const MAX_LOAD_FACTOR_Q8 = 179; // ~0.7 in Q8 (179/256)

/** Power-of-two ceil */
export function ceilPow2(n: number): number {
  let c = 1;
  while (c < n) c <<= 1;
  return c >>> 0;
}

/** A very fast (prev,cur) -> index hash with decent mixing for 32-bit ints */
export function hashPair(prev: number, cur: number): number {
  // Mix two 32-bit keys; constants from splitmix/murmur families
  let x = (prev >>> 0) * 0x9e3779b1; // 2654435761
  x = (x ^ ((x >>> 16) ^ ((cur >>> 0) * 0x85ebca77))) >>> 0; // 2246822519
  // final avalanche-ish
  x ^= x >>> 13;
  x = (x * 0xc2b2ae3d) >>> 0; // 3266489917
  x ^= x >>> 16;
  return x >>> 0;
}

/** Growable dense counter array (Uint32) for parent counts and degrees. */
export class GrowU32 {
  private arr: Uint32Array;
  private readonly maxSize = 1 << 20; // 1M elements max (~4MB)

  constructor(initCap = DEFAULT_PARENT_CAPACITY) {
    this.arr = new Uint32Array(initCap >>> 0);
  }
  ensureSize(ix: number) {
    if (ix < this.arr.length) return;
    if (ix >= this.maxSize) {
      throw new Error(
        `GrowU32: Index ${ix} exceeds maximum size ${this.maxSize}. Hash values may be too large.`
      );
    }
    let cap = this.arr.length;
    let need = ix + 1;
    if (cap === 0) cap = 1;
    while (cap < need) cap <<= 1;
    // Clamp to max size
    if (cap > this.maxSize) cap = this.maxSize;
    const next = new Uint32Array(cap >>> 0);
    next.set(this.arr);
    this.arr = next;
  }
  inc(ix: number, by = 1) {
    this.ensureSize(ix);
    this.arr[ix] = (this.arr[ix] + (by >>> 0)) >>> 0;
  }
  get(ix: number): number {
    return ix < this.arr.length ? this.arr[ix] : 0;
  }
  set(ix: number, v: number) {
    this.ensureSize(ix);
    this.arr[ix] = v >>> 0;
  }
  reset() {
    this.arr.fill(0);
  }
}
