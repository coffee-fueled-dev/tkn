import { fastHash } from "./fast-hash";
import type { KeyGenerator } from ".";

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
