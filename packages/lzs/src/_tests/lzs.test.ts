import { test, expect, describe, beforeEach } from "bun:test";
import { LZS } from "../lzs";
import { DEFAULT_HASH_SEED, RollingHash } from "@tkn/serializers";

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
      mdl: {
        alpha: 0.1,
        zMode: "child-degree",
        beta: 0.02, // EWMA decay
        c: 0.7, // surprise tolerance
        tau: 0.8, // entropy scaling
      },
    });
  });

  test("should correctly process the sequence [0, 1, 1, 2, 1, 2, 3] with adaptive EWMA", () => {
    const input = [0, 1, 1, 2, 1, 2, 3];

    // With adaptive EWMA, expect conservative behavior until it learns patterns
    const expectedOutput = [null, null, null, null, null, null, null];
    let output: (number[] | null)[] = [];
    for (const byte of input) {
      output.push(lzs.processByte(byte));
    }

    output.push(lzs.flush().current);
    // @ts-ignore
    expectedOutput.push([0, 1, 1, 2, 1, 2, 3]); // Full sequence emitted on flush

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
  expect(lzs.keyGenerator.value).toBe(DEFAULT_HASH_SEED);
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

// Should produce different values from the same sequence with different cache sizes
