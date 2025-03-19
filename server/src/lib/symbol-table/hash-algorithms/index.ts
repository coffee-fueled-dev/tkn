export type HashedValue = Uint8Array;

export enum HashAlgorithm {
  SHA256 = "sha256",
  MURMUR3 = "murmur3",
  CYRB53 = "cyrb53",
}

// Re-export hash functions
export { cyrb53 } from "./cyrb53";
export { murmurhash3_32 } from "./murmurhash3_32";
