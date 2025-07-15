import type { KeyGenerator } from ".";

/**
 * Fast deterministic hash optimized for short sequences
 * Uses a simplified polynomial hash with minimal operations
 */
export const fastHash: KeyGenerator = (buffer) => {
  const length = buffer.length;
  if (length === 0) return 0;

  let hash = 0x811c9dc5; // FNV offset basis for consistency

  // Unrolled loop for common small sizes (1-4 bytes)
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
