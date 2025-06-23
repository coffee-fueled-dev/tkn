import type { KeyGenerator } from ".";

/**
 * Fast deterministic hash for token content using FNV-1a algorithm
 */
export const fnvHash: KeyGenerator = (buffer, length) => {
  let hash = 0;

  if (length === 0) return hash;

  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;

  hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < length; i++) {
    hash ^= buffer[i];
    hash = (hash * FNV_PRIME) >>> 0; // Ensure 32-bit unsigned
  }

  return hash;
};
