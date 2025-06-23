import type { LRUCache } from "lru-cache";

/**
 * Hash functions for TKN tokenization
 *
 * These functions provide deterministic, content-based hashing that enables
 * preloading compatibility - the same content always produces the same hash
 * regardless of discovery path.
 */
export type LookupKey = string | number;
export type KeyGenerator = (buffer: Uint8Array, length: number) => LookupKey;
export type KeyGeneratorName = keyof typeof keyGenerators;
export type TokenCache = LRUCache<LookupKey, boolean>;

export const binaryKey: KeyGenerator = (buffer, length) => {
  if (length === 0) return "";

  // Fast path for small windows (1-8 bytes) - use direct conversion
  if (length <= 8) {
    switch (length) {
      case 1:
        return String.fromCharCode(buffer[0]);
      case 2:
        return String.fromCharCode(buffer[0], buffer[1]);
      case 3:
        return String.fromCharCode(buffer[0], buffer[1], buffer[2]);
      case 4:
        return String.fromCharCode(buffer[0], buffer[1], buffer[2], buffer[3]);
      default:
        // For 5-8 bytes, use fromCharCode with spread
        const bytes = Array.from(buffer.subarray(0, length));
        return String.fromCharCode(...bytes);
    }
  }

  // For longer windows, use binary string conversion
  // This is faster than base64 and maintains uniqueness
  let result = "";
  for (let i = 0; i < length; i++) {
    result += String.fromCharCode(buffer[i]);
  }
  return result;
};

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

/**
 * Ultra-fast deterministic hash optimized for short sequences
 * Uses a simplified polynomial hash with minimal operations
 */
export const fastHash: KeyGenerator = (buffer, length) => {
  if (length === 0) return 0;

  let hash = 0x811c9dc5; // FNV offset basis for consistency

  // Unrolled loop for common small sizes (1-8 bytes)
  switch (length) {
    case 1:
      return (hash ^ buffer[0]) >>> 0;
    case 2:
      return (hash ^ buffer[0] ^ (buffer[1] << 8)) >>> 0;
    case 3:
      return (hash ^ buffer[0] ^ (buffer[1] << 8) ^ (buffer[2] << 16)) >>> 0;
    case 4:
      return (
        (hash ^
          buffer[0] ^
          (buffer[1] << 8) ^
          (buffer[2] << 16) ^
          (buffer[3] << 24)) >>>
        0
      );
    default:
      // For longer sequences, use optimized loop
      for (let i = 0; i < length; i++) {
        hash ^= buffer[i];
        hash = (hash * 31) >>> 0; // Faster than FNV prime
      }
      return hash;
  }
};

/**
 * SIMD-inspired hash for longer sequences (when available)
 * Processes 4 bytes at a time when possible
 */
export const simdHash: KeyGenerator = (buffer, length) => {
  if (length === 0) return 0;
  if (length <= 4) return fastHash(buffer, length);

  let hash = 0x811c9dc5;
  let i = 0;

  // Process 4 bytes at a time
  const chunks = Math.floor(length / 4);
  for (let chunk = 0; chunk < chunks; chunk++) {
    const i4 = chunk * 4;
    const combined =
      buffer[i4] |
      (buffer[i4 + 1] << 8) |
      (buffer[i4 + 2] << 16) |
      (buffer[i4 + 3] << 24);
    hash ^= combined;
    hash = (hash * 31) >>> 0;
  }

  // Handle remaining bytes
  for (i = chunks * 4; i < length; i++) {
    hash ^= buffer[i];
    hash = (hash * 31) >>> 0;
  }

  return hash;
};

/**
 * Convenience function to hash a string directly
 */
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
