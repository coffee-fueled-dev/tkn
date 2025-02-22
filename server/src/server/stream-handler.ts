import { randomUUID, type UUID } from "crypto";
import { performance } from "perf_hooks";
import { getTopTkns } from "./getTopTokens.js";
import { Driver, Neo4jError } from "neo4j-driver";
import { pushTokens } from "./pushTokens.js";
import { encode, type EncodedToken } from "../util/encoding.js";
import { RunningStats } from "../util/running-stats.js";
import { parseChunk } from "../util/parse-chunk.js";
import { bpiToMbps } from "../util/bpi-mbps.js";

export interface MergedToken {
  value: EncodedToken;
  idx: number;
}
export interface EnqueuedTask {
  chunk: Buffer;
  resolve: (value: void | PromiseLike<void>) => void;
}

export class StreamHandler {
  private merged: MergedToken[] = [];
  private queue: EnqueuedTask[] = [];
  private sessionId: UUID;
  private workers: Promise<void>[] = [];
  private throughputStats: RunningStats = new RunningStats();
  private pushOp: Promise<void> | undefined = undefined;
  private syncOp: Promise<void> | undefined = undefined;
  private bank: Set<EncodedToken> = new Set();
  private window: number[] = [];
  private taskCount: number = 0;
  private working: boolean = false;
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
    this.sessionId = randomUUID();
    console.log("Session started:", this.sessionId);
    // Kick off the initial bank synchronization.
    this.syncOp = this.syncBank();
  }

  // Refresh the token bank.
  private async syncBank(): Promise<void> {
    const opId = randomUUID();
    console.log(this.sessionId, opId, "Refreshing bank...", "info");
    try {
      this.bank = new Set(await getTopTkns(this.driver, 0.7));
      console.log(this.sessionId, opId, "Bank refreshed.", "success");
    } catch (err) {
      console.log(
        this.sessionId,
        opId,
        `Failed to refresh bank. Code: ${(err as Neo4jError).code}`,
        "error"
      );
    }
  }

  // Worker function to process enqueued tasks.
  private async worker(): Promise<{
    bytes: number;
    start: number;
    end: number;
  }> {
    const start = performance.now();
    const tasks = this.queue.splice(0);
    const data: number[] = [];
    const resolutions: ((value: void | PromiseLike<void>) => void)[] = [];
    let bytes: number = 0;
    let segment: number;
    let bankSize: number;
    let knownTkn: EncodedToken;
    let tokenIdx = 0;

    try {
      for (const { chunk, resolve } of tasks) {
        bytes += chunk.length;
        data.push(...parseChunk(chunk));
        resolutions.push(resolve);
      }

      this.taskCount = data.length;

      for (let i = 0; i < this.taskCount; i++) {
        segment = data[i];
        this.window.push(segment);
        bankSize = this.bank.size;
        this.bank.add(encode(this.window));

        if (this.bank.size > bankSize) {
          knownTkn = encode(this.window.slice(0, -1));
          this.merged.push({ value: knownTkn, idx: tokenIdx });
          this.window = [segment]; // Reset window to the current segment.
          tokenIdx += 1;
        }
      }

      await Promise.all(resolutions);
      return { bytes, start, end: performance.now() };
    } finally {
      this.working = false; // Release the worker slot.
    }
  }

  /**
   * Enqueue a new chunk of data for processing.
   * The worker will batch tasks and process them asynchronously.
   *
   * @param chunk - The chunk of data to process.
   * @returns A promise that resolves when the task is enqueued.
   */
  public enqueueTask(chunk: Buffer): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.push({ chunk, resolve });
      if (!this.working) {
        this.working = true;
        this.workers.push(
          this.worker()
            .then(({ bytes, start, end }) => {
              const duration = end - start;
              const throughput = bpiToMbps(bytes, duration);
              this.throughputStats.add(throughput, duration);
              console.log(this.sessionId, throughput);
            })
            .then(() => {
              if (
                this.merged.length > Number(process.env.PUSHAT || 20) &&
                this.pushOp === undefined
              ) {
                this.pushOp = pushTokens(
                  this.sessionId,
                  this.merged,
                  this.driver
                )
                  .then(() => {
                    if (this.syncOp === undefined) {
                      this.syncOp = this.syncBank().finally(() => {
                        this.syncOp = undefined;
                      });
                    }
                  })
                  .catch(console.error)
                  .finally(() => {
                    this.pushOp = undefined;
                  });
              }
            })
        );
      }
    });
  }

  /**
   * Call this method when no more data will be enqueued.
   * It processes any remaining tasks and pushes tokens if necessary.
   */
  public async finish(): Promise<void> {
    if (this.window.length) {
      this.merged.push({ value: encode(this.window), idx: this.merged.length });
    }
    await Promise.all(this.workers);
    if (this.merged.length) {
      if (this.pushOp) {
        await this.pushOp;
      } else {
        await pushTokens(this.sessionId, this.merged, this.driver);
      }
    }
    console.log(this.sessionId, this.throughputStats);
  }
}
