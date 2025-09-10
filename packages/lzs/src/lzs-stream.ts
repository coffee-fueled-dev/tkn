import type { ILZS, ILZSStream } from "./domain";

/**
 * Adapts a synchronous ILZS instance to a web streams interface,
 * providing a WritableStream for input bytes and a ReadableStream for output tokens.
 */
export class LZSStream implements ILZSStream {
  readonly readable: ReadableStream<Uint8Array | null>;
  readonly writable: WritableStream<number>;

  constructor(lzs: ILZS) {
    let controller: ReadableStreamDefaultController<Uint8Array | null>;

    this.readable = new ReadableStream<Uint8Array | null>({
      start(c) {
        controller = c;
      },
    });

    this.writable = new WritableStream<number>({
      write(chunk) {
        const token = lzs.processByte(chunk);
        controller.enqueue(token ? new Uint8Array(token) : null);
      },
      close() {
        const finalToken = lzs.flush().current;
        controller.enqueue(finalToken ? new Uint8Array(finalToken) : null);
        controller.close();
      },
      abort(reason) {
        controller.error(reason);
      },
    });
  }
}
