import {
  Transform,
  type TransformCallback,
  type TransformOptions,
} from "stream";
import { sayHello } from "../lib/logs";

export class Observer extends Transform {
  private bank = new Map<string, number>();
  private window: number[] = [];
  private idx: number = 0;

  constructor(options?: TransformOptions) {
    super({ objectMode: true, ...options });
    sayHello();
  }

  _transform(chunk: Buffer, _: BufferEncoding, callback: TransformCallback) {
    let segment: number;
    for (let i = 0; i < chunk.length; i++) {
      segment = chunk[i];
      this.window.push(segment);
      const ref = this.window.join("|");
      if (!this.bank.has(ref)) {
        const lifespan = 100; // todo: compute based on the current topology of the bank
        const known = this.window.slice(0, -1);
        // decrement the life of each tknen in the bank other than the known token
        this.bank.forEach((v, k, m) => {
          const l = v - 1;
          l === 0 ? m.delete(k) : l;
        });
        this.bank.set(known.join("|"), lifespan);
        this.bank.set(ref, lifespan);
        this.push({
          buffer: Buffer.from(known),
          idx: this.idx,
        });
        this.window = [segment];
        this.idx++;
      }
    }

    callback();
  }

  public getWindow() {
    return this.window;
  }

  public getBank() {
    return this.bank;
  }
}
