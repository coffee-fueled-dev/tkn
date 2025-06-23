import { binaryKey } from "./binary-key";
import { fnvHash } from "./fvn-hash";
import { fastHash } from "./fast-hash";
import { simdHash } from "./simd-hash";

export type LookupKey = string | number;
export type KeyGenerator = (buffer: Uint8Array, length: number) => LookupKey;
export type KeyGeneratorName = keyof typeof keyGenerators;

export const hashString = (text: string, hashFunction: KeyGenerator) => {
  const buffer = new TextEncoder().encode(text);
  return hashFunction(buffer, buffer.length);
};

export const keyGenerators = {
  binaryKey,
  fnvHash,
  fastHash,
  simdHash,
} as const;
