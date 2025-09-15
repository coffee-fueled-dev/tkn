import { Uint8 } from "../../serializers/src/uint8";
import type { ILZS, ILZSConfig } from "./lzs.domain";
import { LZS } from "./lzs";
import type { IFlushResult } from "./_shared.domain";

/**
 * LZSBigram is a wrapper around LZS that reprocesses tokens
 * that were emit by a inner LZS into chunk-level tokens
 */
export class LZSBigram extends LZS implements ILZS {
  private _innerLZS: LZS;

  constructor(lzs?: ILZSConfig | LZS, config?: ILZSConfig) {
    super(config);
    this._innerLZS = lzs instanceof LZS ? lzs : new LZS(lzs);
  }

  push(int: number): number[] | null {
    const token = this._innerLZS.push(int);
    if (token) {
      let bigram: number[] | null = null;

      if (token.length < 5) {
        bigram = super.push(Uint8.toNumber(new Uint8Array(token)));
      } else {
        for (const int of token) {
          bigram = super.push(int);
        }
      }

      if (bigram) {
        let token: number[] = [];
        for (const b of bigram) {
          if (b > 256) {
            token = token.concat([...Uint8.toUint8Array(b)]);
          } else {
            token = token.concat([b]);
          }
        }

        return token;
      }
    }
    return null;
  }

  flush = (): IFlushResult => {
    const innerFlushResults: number[][] = [];
    const innerLZSFlush = this._innerLZS.flush();
    for (const token of innerLZSFlush.current ?? []) {
      for (const b of token) {
        const emitted = super.push(b);
        if (emitted) {
          innerFlushResults.push(emitted);
        }
      }
    }

    return {
      cache: this._cache,
      current: innerFlushResults,
    };
  };
}
