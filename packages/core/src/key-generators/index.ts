import { fastHash } from "./fast-hash";

export type LookupKey = string;
export type KeyGenerator = (buffer: Uint8Array) => number;
export type KeyGeneratorName = keyof typeof keyGenerators;

export const keyGenerators = {
  fastHash,
} as const;
