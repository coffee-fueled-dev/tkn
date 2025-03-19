import type { HashedValue } from ".";

/**
 * Implementation of cyrb53 hash
 * A simple and effective 64-bit non-cryptographic hash function
 */
export function cyrb53(
  str: string,
  seed = 0,
  hashSize: number = 64
): HashedValue {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  // Create result buffer
  const result = new Uint8Array(hashSize);

  // Fill the first 8 bytes with our 64-bit result
  const bytesToFill = Math.min(8, hashSize);
  for (let i = 0; i < bytesToFill; i++) {
    if (i < 4) {
      result[i] = (h2 >>> (i * 8)) & 0xff;
    } else {
      result[i] = (h1 >>> ((i - 4) * 8)) & 0xff;
    }
  }

  return result;
}
