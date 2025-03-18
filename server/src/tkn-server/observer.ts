/**
 * Observer - Token sequence parser
 * It processes incoming data buffers and identifies token sequences.
 */

import { sayHello, hello } from "../lib/logs";
import { recordOperation } from "./throughput-monitor";

// Define the type for the token processed by the Observer
export interface OutputToken {
  buffer: Buffer;
  idx: number;
}

export type ObserverCallback = (
  error: Error | null,
  data?: OutputToken
) => void;

export class Observer {
  private bank = new Map<string, number>();
  private window: number[] = [];
  private idx: number = 0;
  private maxLifespan: number;

  constructor(maxLifespan: number = 100) {
    this.maxLifespan = maxLifespan;
    sayHello();
    hello.server.info("Observer initialized");
  }

  /**
   * Process a chunk of data and emit token sequences
   */
  transform(chunk: Buffer, callback: ObserverCallback) {
    const startTime = performance.now();
    hello.observer.debug("Received chunk:", chunk.toString("hex"));
    let segment: number;

    try {
      for (let i = 0; i < chunk.length; i++) {
        segment = chunk[i];
        this.window.push(segment);
        const ref = this.window.join("|");

        // Decrement the lifespan of each token in the bank
        decrementLife(this.bank);

        if (this.bank.has(ref)) {
          recordOperation(
            "observer",
            "duplicate-token",
            performance.now() - startTime
          );
          callback(null);
          return;
        }

        const known = this.window.slice(0, -1);
        hello.observer.debug(
          "Known window (excluding current):",
          known.join("|")
        );

        // Update the bank with the new token data
        this.bank.set(known.join("|"), this.maxLifespan);
        this.bank.set(ref, this.maxLifespan);

        // Create the token to emit
        const outputTokenBuffer = Buffer.from(known);

        const token: OutputToken = {
          buffer: outputTokenBuffer,
          idx: this.idx,
        };

        // Reset the window to start with the current segment
        this.window = [segment];
        this.idx++;

        recordOperation(
          "observer",
          "token-processed",
          performance.now() - startTime,
          false,
          ["sync-stream"]
        );

        // Call the callback with the new token
        callback(null, token);
        return;
      }
    } catch (error) {
      recordOperation(
        "observer",
        "token-processing",
        performance.now() - startTime,
        true
      );
      callback(error as Error);
    }
  }

  public getWindow() {
    return this.window;
  }

  public getBank() {
    return this.bank;
  }
}

const decrementLife = (bank: Map<string, number>) =>
  bank.forEach((v, k, m) => {
    const newLife = v - 1;
    if (newLife === 0) {
      hello.observer.debug(`Token expired and removed: ${k}`);
      m.delete(k);
    } else {
      m.set(k, newLife);
    }
  });
