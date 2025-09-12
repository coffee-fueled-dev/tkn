import type { BunFile } from "bun";

type PhaseRanges = {
  train: [start: number, end: number];
  dev: [start: number, end: number];
  val: [start: number, end: number];
};

export class PhaseStreamRouter {
  private readonly file: BunFile;
  private readonly fileSize: number;
  private readonly ranges: PhaseRanges;

  constructor(
    filePath: string,
    boundaries: [number, number, number],
    fileSize: number
  ) {
    // boundaries: [endTrain, endDev, endVal] absolute byte offsets
    if (boundaries.length !== 3) throw new Error("Expected 3 phase boundaries");
    const [b0, b1, b2] = boundaries;

    if (!(b0 <= b1 && b1 <= b2 && b2 === fileSize)) {
      throw new Error(
        `Invalid boundaries. Must satisfy 0 < b0 <= b1 <= b2 === fileSize`
      );
    }

    const file = Bun.file(filePath);
    if (!file) throw new Error(`Cannot open file: ${filePath}`);

    this.file = file;
    this.fileSize = fileSize;

    this.ranges = {
      train: [0, b0],
      dev: [b0, b1],
      val: [b1, b2],
    };
  }

  /** Fresh async iterable over an arbitrary [start,end) range */
  range(start: number, end: number): AsyncIterable<Uint8Array> {
    if (start < 0 || end > this.fileSize || start > end) {
      throw new Error(
        `Invalid range [${start}, ${end}) for fileSize=${this.fileSize}`
      );
    }
    // Create a fresh stream for this slice, every time this method is called.
    const stream = this.file.slice(start, end).stream();

    // Convert ReadableStream<Uint8Array> to AsyncIterable<Uint8Array>
    const iterable: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]: async function* () {
        const reader = stream.getReader(); // fresh reader for this stream
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            // value is Uint8Array
            if (value && value.byteLength) yield value;
          }
        } finally {
          reader.releaseLock();
        }
      },
    };
    return iterable;
  }

  /** Fresh async iterable for the training phase */
  train(): AsyncIterable<Uint8Array> {
    const [s, e] = this.ranges.train;
    return this.range(s, e);
  }

  /** Fresh async iterable for the dev/tuning phase */
  dev(): AsyncIterable<Uint8Array> {
    const [s, e] = this.ranges.dev;
    return this.range(s, e);
  }

  /** Fresh async iterable for the validation phase */
  val(): AsyncIterable<Uint8Array> {
    const [s, e] = this.ranges.val;
    return this.range(s, e);
  }
}
