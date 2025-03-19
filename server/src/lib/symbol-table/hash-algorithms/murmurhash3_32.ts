import type { HashedValue } from ".";

/**
 * Implementation of MurmurHash3 (32-bit variant)
 * A fast non-cryptographic hash function
 */
export function murmurhash3_32(
  data: string,
  seed = 0,
  hashSize: number = 64
): HashedValue {
  let h = seed;
  const k = 0x5bd1e995;
  const r = 24;
  const len = data.length;

  // Process 4 bytes at a time
  for (let i = 0; i < len; i += 4) {
    let k1 =
      data.charCodeAt(i & 0xff) |
      (((i + 1 < len ? data.charCodeAt(i + 1) : 0) & 0xff) << 8) |
      (((i + 2 < len ? data.charCodeAt(i + 2) : 0) & 0xff) << 16) |
      (((i + 3 < len ? data.charCodeAt(i + 3) : 0) & 0xff) << 24);

    k1 = Math.imul(k1, k);
    k1 = (k1 << r) | (k1 >>> (32 - r));
    k1 = Math.imul(k1, k);

    h = Math.imul(h, k);
    h ^= k1;
  }

  // Finalization
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;

  // Create HashedValue from the 32-bit integer
  const result = new Uint8Array(hashSize);
  for (let i = 0; i < Math.min(4, hashSize); i++) {
    result[i] = (h >>> (i * 8)) & 0xff;
  }

  return result;
}
