export type HashedValue = Uint8Array;

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

  return createHashBuffer(h1, h2, hashSize);
}

export function cyrb53FromBytes(
  data: Uint8Array,
  seed = 0,
  hashSize: number = 64
): HashedValue {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return createHashBuffer(h1, h2, hashSize);
}

function createHashBuffer(
  h1: number,
  h2: number,
  hashSize: number
): HashedValue {
  const result = new Uint8Array(hashSize);
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
