import type { KeyGenerator } from ".";

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
