import { LRUCache } from "lru-cache";
import { type HashedValue, cyrb53 } from "./cyrb53";

export interface OutputToken {
  hashes: HashedValue[];
  idx: number;
  originalData?: any[];
}

export type TknMinerCallback = (
  error: Error | null,
  data: OutputToken | null
) => Promise<void>;

export class TknMiner {
  private bank: LRUCache<string, boolean>;
  private window: HashedValue[] = [];
  private idx: number = 0;
  private keyCache = new Map<string, string>();

  constructor(bankSize: number = 1000) {
    this.bank = new LRUCache<string, boolean>({
      max: bankSize,
    });
  }

  private getKey(hashes: HashedValue[]): string {
    const simpleCacheKey = hashes
      .map((h) =>
        h.length > 4
          ? `${h[0]}.${h[1]}.${h[2]}.${h[3]}`
          : Array.from(h).join(".")
      )
      .join(",");

    let key = this.keyCache.get(simpleCacheKey);
    if (key === undefined) {
      key = this.createKey(hashes);
      if (hashes.length < 10) {
        this.keyCache.set(simpleCacheKey, key);
      }
    }
    return key;
  }

  /**
   * Process a chunk of hashed values and emit token sequences
   * @param hashedChunk Array of HashedValues to process
   * @param callback Callback to invoke with results
   */
  transform(hashedChunk: HashedValue[], callback: TknMinerCallback) {
    let segment: HashedValue;

    try {
      for (let i = 0; i < hashedChunk.length; i++) {
        segment = hashedChunk[i];
        this.window.push(segment);

        const windowKey = this.getKey(this.window);

        if (this.bank.has(windowKey)) {
          callback(null, null);
          continue;
        }

        const known = this.window.slice(0, -1);
        const knownKey = this.getKey(known);

        this.bank.set(knownKey, true);
        this.bank.set(windowKey, true);

        const token: OutputToken = {
          hashes: known,
          idx: this.idx,
        };

        this.window = [segment];
        this.idx++;

        callback(null, token);
      }
    } catch (error) {
      callback(error as Error, null);
    }
  }

  private createKey(hashes: HashedValue[]): string {
    if (hashes.length === 0) return "";
    if (hashes.length === 1) return Buffer.from(hashes[0]).toString("base64");

    const combined = Buffer.concat(
      hashes.flatMap((hash) => [hash, Buffer.from("|")])
    );

    const keyHash = cyrb53(combined.toString("binary"), 0, 32);
    return Buffer.from(keyHash).toString("base64");
  }
}
