import { Uint8 } from "../../serializers/src/uint8";
import type { ILZSConfig } from "./domain";
import { LZS } from "./lzs";

/**
 * LZSBigram is a wrapper around LZS that reprocesses tokens
 * that were emit by a byte-level LZS into chunk-level tokens
 */
export class LZSBigram extends LZS {
  private _lzsBytes: LZS;

  constructor(lzsBytes: LZS, config: ILZSConfig) {
    super(config);
    this._lzsBytes = lzsBytes;
  }

  processByte(byte: number): number[] | null {
    const token = this._lzsBytes.processByte(byte);
    if (token) {
      let bigram: number[] | null = null;

      if (token.length < 5) {
        bigram = super.processByte(Uint8.toNumber(new Uint8Array(token)));
      } else {
        for (const byte of token) {
          bigram = super.processByte(byte);
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
}
