import { test, expect, describe } from "bun:test";
import { fastHash } from "../fast-hash";

describe("fastHash", () => {
  test("returns 0 for empty buffer", () => {
    const result = fastHash(new Uint8Array(0));
    expect(result).toBe(0);
  });

  test("handles single byte", () => {
    const result1 = fastHash(new Uint8Array([65])); // 'A'
    const result2 = fastHash(new Uint8Array([66])); // 'B'

    expect(typeof result1).toBe("number");
    expect(typeof result2).toBe("number");
    expect(result1).not.toBe(result2);
    expect(result1).toBeGreaterThanOrEqual(0);
    expect(result1).toBeLessThanOrEqual(0xffffffff);
  });

  test("handles two bytes", () => {
    const result1 = fastHash(new Uint8Array([65, 66])); // 'AB'
    const result2 = fastHash(new Uint8Array([66, 65])); // 'BA'

    expect(result1).not.toBe(result2);
    expect(result1).toBeGreaterThanOrEqual(0);
    expect(result2).toBeGreaterThanOrEqual(0);
  });

  test("handles three bytes", () => {
    const result1 = fastHash(new Uint8Array([65, 66, 67])); // 'ABC'
    const result2 = fastHash(new Uint8Array([67, 66, 65])); // 'CBA'

    expect(result1).not.toBe(result2);
  });

  test("handles four bytes", () => {
    const result1 = fastHash(new Uint8Array([65, 66, 67, 68])); // 'ABCD'
    const result2 = fastHash(new Uint8Array([68, 67, 66, 65])); // 'DCBA'

    expect(result1).not.toBe(result2);
  });

  test("handles longer sequences", () => {
    const longBuffer = new Uint8Array(100);
    for (let i = 0; i < 100; i++) {
      longBuffer[i] = i % 256;
    }

    const result = fastHash(longBuffer);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });

  test("is deterministic", () => {
    const buffer = new Uint8Array([72, 101, 108, 108, 111]); // 'Hello'

    const result1 = fastHash(buffer);
    const result2 = fastHash(buffer);
    const result3 = fastHash(new Uint8Array([72, 101, 108, 108, 111]));

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  test("produces different hashes for different inputs", () => {
    const inputs = [
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([1, 2]),
      new Uint8Array([2, 1]),
      new Uint8Array([1, 2, 3]),
      new Uint8Array([3, 2, 1]),
      new Uint8Array([0, 0, 0, 0]),
      new Uint8Array([255, 255, 255, 255]),
    ];

    const results = inputs.map((input) => fastHash(input));
    const uniqueResults = new Set(results);

    expect(uniqueResults.size).toBe(results.length);
  });

  test("handles all byte values", () => {
    // Test with all possible byte values
    const buffer = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      buffer[i] = i;
    }

    const result = fastHash(buffer);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });

  test("handles UTF-8 encoded strings correctly", () => {
    const encoder = new TextEncoder();

    // Test various Unicode strings
    const testCases = [
      "hello",
      "café",
      "中文",
      "🚀",
      "मानक",
      "العربية",
      "Ελληνικά",
    ];

    const hashes = new Set<number>();

    for (const str of testCases) {
      const buffer = encoder.encode(str);
      const hash = fastHash(buffer);

      expect(typeof hash).toBe("number");
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);

      hashes.add(hash);
    }

    // All hashes should be unique
    expect(hashes.size).toBe(testCases.length);
  });

  test("avalanche effect - small input changes produce different hashes", () => {
    const base = new Uint8Array([1, 2, 3, 4, 5]);
    const baseHash = fastHash(base);

    // Change each byte and verify hash changes
    for (let i = 0; i < base.length; i++) {
      const modified = new Uint8Array(base);
      modified[i] = modified[i] ^ 1; // Flip one bit

      const modifiedHash = fastHash(modified);
      expect(modifiedHash).not.toBe(baseHash);
    }
  });

  test("handles edge cases with repeated bytes", () => {
    const allZeros = new Uint8Array(10).fill(0);
    const allOnes = new Uint8Array(10).fill(1);
    const allMax = new Uint8Array(10).fill(255);

    const hash1 = fastHash(allZeros);
    const hash2 = fastHash(allOnes);
    const hash3 = fastHash(allMax);

    expect(hash1).not.toBe(hash2);
    expect(hash2).not.toBe(hash3);
    expect(hash1).not.toBe(hash3);
  });

  test("distribution appears reasonable for similar inputs", () => {
    const hashes = new Set<number>();

    // Generate similar strings with small variations
    for (let i = 0; i < 100; i++) {
      const str = `test${i}`;
      const buffer = new TextEncoder().encode(str);
      const hash = fastHash(buffer);
      hashes.add(hash);
    }

    // Should have very few collisions
    expect(hashes.size).toBeGreaterThan(95);
  });

  test("returns 32-bit unsigned integer", () => {
    const testCases = [
      new Uint8Array([]),
      new Uint8Array([0]),
      new Uint8Array([255]),
      new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      new Uint8Array(1000).fill(42),
    ];

    for (const buffer of testCases) {
      const hash = fastHash(buffer);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(hash)).toBe(true);
    }
  });

  test("performance with various input sizes", () => {
    const sizes = [0, 1, 2, 3, 4, 10, 100, 1000];

    for (const size of sizes) {
      const buffer = new Uint8Array(size);
      for (let i = 0; i < size; i++) {
        buffer[i] = i % 256;
      }

      const start = performance.now();
      const hash = fastHash(buffer);
      const end = performance.now();

      expect(typeof hash).toBe("number");
      expect(end - start).toBeLessThan(10); // Should be very fast
    }
  });
});
