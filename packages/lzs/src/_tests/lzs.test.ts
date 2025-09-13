import { test, expect, describe, beforeEach } from "bun:test";
import { LZS } from "../lzs";
import { HASH_SEED, RollingHash } from "@tkn/serializers";

describe("LZS", () => {
  let lzs: LZS;

  beforeEach(() => {
    lzs = new LZS({
      keyGenerator: new RollingHash(),
      cache: { size: 100 },
      trustThreshold: 1,
      trieSearch: {
        mode: "enabled",
      },
    });
  });

  test("should correctly process the sequence [0, 1, 1, 2, 1, 2, 3]", () => {
    const input = [0, 1, 1, 2, 1, 2, 3];

    const expectedOutput = [null, [0], [1], [1], [2], null, [1, 2]];
    let output: (number[] | null)[] = [];
    for (const byte of input) {
      output.push(lzs.processByte(byte));
    }

    output.push(lzs.flush().current);
    expectedOutput.push([3]);

    console.log(output);
    expect(output).toEqual(expectedOutput);
  });
});

test("clear() should reset the state", () => {
  const lzs = new LZS({
    keyGenerator: new RollingHash(),
    cache: {},
    trustThreshold: 1,
  });
  lzs.processByte(1);
  lzs.processByte(2);
  lzs.clear();
  const flushResult = lzs.flush();
  expect(flushResult.current).toBeNull();
  expect(lzs.cache.size).toBe(0);
  expect(lzs.keyGenerator.value).toBe(HASH_SEED);
});

test("should handle an empty input", () => {
  const lzs = new LZS({
    keyGenerator: new RollingHash(),
    cache: {},
  });
  const output = [].map((byte) => lzs.processByte(byte));
  const flush = lzs.flush();
  output.push(flush.current);
  expect(output).toEqual([null]);
});

// Should produce different values from the same sequence with different trust thresholds
// Should produce different cache states from the same sequence with different trust thresholds
// Should produce different values from the same sequence with different cache sizes
