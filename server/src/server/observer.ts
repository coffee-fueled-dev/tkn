import {
  Transform,
  type TransformCallback,
  type TransformOptions,
} from "stream";
import { sayHello, hello } from "../lib/logs";

export class Observer extends Transform {
  private bank = new Map<string, number>();
  private window: number[] = [];
  private idx: number = 0;

  constructor(options?: TransformOptions) {
    super({ objectMode: true, ...options });
    sayHello();
    hello.server.info("Observer initialized");
  }

  _transform(chunk: Buffer, _: BufferEncoding, callback: TransformCallback) {
    hello.observer.debug("Received chunk:", chunk.toString("hex"));
    let segment: number;
    for (let i = 0; i < chunk.length; i++) {
      segment = chunk[i];
      this.window.push(segment);
      hello.observer.debug("Updated window:", this.window.join(","));
      const ref = this.window.join("|");
      hello.observer.debug("Computed token ref:", ref);

      if (!this.bank.has(ref)) {
        const lifespan = 100; // todo: compute based on the current topology of the bank
        const known = this.window.slice(0, -1);
        hello.observer.debug(
          "Known window (excluding current):",
          known.join("|")
        );

        // Decrement the lifespan of each token in the bank
        this.bank.forEach((v, k, m) => {
          const newLife = v - 1;
          if (newLife === 0) {
            hello.observer.debug(`Token expired and removed: ${k}`);
            m.delete(k);
          } else {
            m.set(k, newLife);
          }
        });

        // Update the bank with the new token data
        this.bank.set(known.join("|"), lifespan);
        this.bank.set(ref, lifespan);
        hello.observer.debug(
          "Updated bank keys:",
          Array.from(this.bank.keys())
        );

        // Push the token downstream
        const pushedBuffer = Buffer.from(known);
        hello.observer.debug(
          "Pushing token buffer:",
          pushedBuffer.toString("hex")
        );
        this.push({
          buffer: pushedBuffer,
          idx: this.idx,
        });
        hello.observer.debug(`Token with index ${this.idx} pushed.`);

        // Reset the window to start with the current segment
        this.window = [segment];
        this.idx++;
      }
    }
    callback();
  }

  public getWindow() {
    hello.observer.debug("getWindow called:", this.window.join(","));
    return this.window;
  }

  public getBank() {
    hello.observer.debug("getBank called:", Array.from(this.bank.keys()));
    return this.bank;
  }
}
