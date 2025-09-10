/**
 * Convert a byte array to a single BLOB hex literal string: "\xDEADBEEF"
 */
export const hexString = (arr: number[]): string => {
  const hex = arr
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  return "\\x" + hex;
};
