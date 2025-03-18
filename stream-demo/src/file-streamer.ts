import * as fs from "fs";
import { Transform } from "stream";

class ChunkDelayTransform extends Transform {
  private delay: number;
  private chunkSize: number;

  constructor(delay: number, chunkSize: number) {
    super();
    this.delay = delay;
    this.chunkSize = chunkSize;
  }

  _transform(chunk: Buffer, encoding: string, callback: Function) {
    // Process the chunk after the specified delay
    setTimeout(() => {
      this.push(chunk);
      callback();
    }, this.delay);
  }
}

export function createFileStreamer(
  filePath: string,
  delayMs: number = 100,
  chunkSize: number = 1
) {
  const readStream = fs.createReadStream(filePath, {
    encoding: "utf-8",
    highWaterMark: chunkSize, // Controls the size of chunks read
  });

  const delayTransform = new ChunkDelayTransform(delayMs, chunkSize);

  return readStream.pipe(delayTransform);
}
