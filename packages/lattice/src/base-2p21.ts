export class Base2p21 {
  // One digit per codepoint: d = c + 1 in [1 .. 2^21-1]
  private static readonly RADIX_BITS = 21n;
  private static readonly RADIX_MASK = (1n << Base2p21.RADIX_BITS) - 1n; // 0x1F_FFFF
  private static readonly CHUNK_K = 4; // digits per chunk
  private static readonly CHUNK_BITS =
    Base2p21.RADIX_BITS * BigInt(Base2p21.CHUNK_K); // 84

  /** Encode codepoints -> BigInt using 4-at-a-time batching with shifts only. */
  static encode = (codepoints: number[]): bigint => {
    let x = 0n;
    const n = codepoints.length;

    // Process full chunks of 4 digits
    let i = 0;
    const K = Base2p21.CHUNK_K;
    for (; i + K <= n; i += K) {
      // Build chunk = (((d0<<21) | d1) << 42) | ((d2<<21) | d3)
      const d0 = BigInt((codepoints[i] + 1) >>> 0);
      const d1 = BigInt((codepoints[i + 1] + 1) >>> 0);
      const d2 = BigInt((codepoints[i + 2] + 1) >>> 0);
      const d3 = BigInt((codepoints[i + 3] + 1) >>> 0);

      // (optional) bounds checks can be enabled if you want safety:
      // if (codepoints[i] < 0 || codepoints[i] > 0x10FFFF) throw ...
      // ...

      const w0 = (d0 << Base2p21.RADIX_BITS) | d1; // 42 bits
      const w1 = (d2 << Base2p21.RADIX_BITS) | d3; // 42 bits
      const chunk = (w0 << (Base2p21.RADIX_BITS * 2n)) | w1; // 84 bits

      x = (x << Base2p21.CHUNK_BITS) | chunk;
    }

    // Tail: 0..3 remaining digits
    for (; i < n; i++) {
      const d = BigInt((codepoints[i] + 1) >>> 0);
      x = (x << Base2p21.RADIX_BITS) | d;
    }

    return x; // empty [] maps to 0n
  };

  /** Decode BigInt -> codepoints[] using masks & shifts only. */
  static decode = (index: bigint): number[] => {
    if (index < 0n) throw new RangeError("negative index");
    if (index === 0n) return [];

    // Simple approach: extract all digits in reverse order, then reverse
    const digits: number[] = [];
    let remaining = index;

    while (remaining > 0n) {
      const digit = Number(remaining & Base2p21.RADIX_MASK) - 1;
      digits.push(digit);
      remaining >>= Base2p21.RADIX_BITS;
    }

    // Reverse to get original order
    digits.reverse();
    return digits;
  };

  /** Append one codepoint: x' = (x << 21) | (c+1). */
  static append1 = (index: bigint, c: number): bigint => {
    return (index << Base2p21.RADIX_BITS) | BigInt((c + 1) >>> 0);
  };

  /** Append four codepoints at once (fast path). */
  static append4 = (
    index: bigint,
    c0: number,
    c1: number,
    c2: number,
    c3: number
  ): bigint => {
    const d0 = BigInt((c0 + 1) >>> 0);
    const d1 = BigInt((c1 + 1) >>> 0);
    const d2 = BigInt((c2 + 1) >>> 0);
    const d3 = BigInt((c3 + 1) >>> 0);
    const w0 = (d0 << Base2p21.RADIX_BITS) | d1;
    const w1 = (d2 << Base2p21.RADIX_BITS) | d3;
    const chunk = (w0 << (Base2p21.RADIX_BITS * 2n)) | w1; // 84 bits
    return (index << Base2p21.CHUNK_BITS) | chunk;
  };

  /** Pop one codepoint (throws on empty). */
  static pop1 = (index: bigint): { index: bigint; c?: number } => {
    if (index <= 0n) throw new RangeError("empty");
    const d = Number(index & Base2p21.RADIX_MASK);
    return { index: index >> Base2p21.RADIX_BITS, c: d - 1 };
  };

  /** Pop up to four codepoints at once. Returns how many were popped. */
  static pop4 = (
    index: bigint
  ): {
    index: bigint;
    c0?: number;
    c1?: number;
    c2?: number;
    c3?: number;
    count: number;
  } => {
    if (index <= 0n) throw new RangeError("empty");
    // If fewer than 4 digits remain, fall back to 1-at-a-time
    if (index < 1n << Base2p21.CHUNK_BITS) {
      const { index: i1, c: c3 } = this.pop1(index);
      if (i1 === 0n) return { index: i1, c0: c3, count: 1 };
      const { index: i2, c: c2 } = this.pop1(i1);
      if (i2 === 0n) return { index: i2, c0: c2, c1: c3, count: 2 };
      const { index: i3, c: c1 } = this.pop1(i2);
      if (i3 === 0n) return { index: i3, c0: c1, c1: c2, c2: c3, count: 3 };
      const { index: i4, c: c0 } = this.pop1(i3);
      return { index: i4, c0, c1, c2, c3, count: 4 };
    }
    const chunk = index & ((1n << Base2p21.CHUNK_BITS) - 1n);
    const next = index >> Base2p21.CHUNK_BITS;
    let w = chunk;
    const d3 = Number(w & Base2p21.RADIX_MASK);
    w >>= Base2p21.RADIX_BITS;
    const d2 = Number(w & Base2p21.RADIX_MASK);
    w >>= Base2p21.RADIX_BITS;
    const d1 = Number(w & Base2p21.RADIX_MASK);
    w >>= Base2p21.RADIX_BITS;
    const d0 = Number(w & Base2p21.RADIX_MASK);
    return {
      index: next,
      c0: d0 - 1,
      c1: d1 - 1,
      c2: d2 - 1,
      c3: d3 - 1,
      count: 4,
    };
  };
}
