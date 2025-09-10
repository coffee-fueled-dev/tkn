import { test, expect, describe } from "bun:test";
import { LZS } from "../lzs";
import { LZSStream } from "../lzs-stream";
import { RollingHash } from "@tkn/serializers";

describe("LZSStream", () => {
  test("should correctly process a stream of bytes", async () => {
    // 1. Setup
    const lzs = new LZS({
      keyGenerator: new RollingHash(),
      cache: {},
      trustThreshold: 1,
    });
    const streamAdapter = new LZSStream(lzs);

    const input = [0, 1, 1, 2, 1, 2, 3];
    const expectedOutput = [
      null,
      new Uint8Array([0]),
      new Uint8Array([1]),
      new Uint8Array([1]),
      new Uint8Array([2]),
      null,
      new Uint8Array([1, 2]),
      new Uint8Array([3]),
    ];

    // 2. Act
    const reader = streamAdapter.readable.getReader();
    const writer = streamAdapter.writable.getWriter();

    const receivedTokens: (Uint8Array | null)[] = [];
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedTokens.push(value);
      }
    })();

    for (const byte of input) {
      await writer.write(byte);
    }
    await writer.close();

    await readPromise;

    // 3. Assert
    expect(receivedTokens).toEqual(expectedOutput);
  });

  test("should handle an empty input stream", async () => {
    const lzs = new LZS({ keyGenerator: new RollingHash(), cache: {} });
    const streamAdapter = new LZSStream(lzs);

    const expectedOutput = [null];

    const reader = streamAdapter.readable.getReader();
    const writer = streamAdapter.writable.getWriter();

    const receivedTokens: (Uint8Array | null)[] = [];
    const readPromise = (async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedTokens.push(value);
      }
    })();

    await writer.close(); // Close immediately

    await readPromise;

    expect(receivedTokens).toEqual(expectedOutput);
  });
});
