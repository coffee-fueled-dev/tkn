import type { ILZS, ILZSConfig } from "./lzs.domain";
import { LZS } from "./lzs";
import type { IFlushResult } from "./_shared.domain";

export class LZSBoundary extends LZS implements ILZS {
  private _innerLZS: LZS;

  constructor(lzs?: ILZSConfig | LZS, config?: ILZSConfig) {
    super(config);
    this._innerLZS = lzs instanceof LZS ? lzs : new LZS(lzs);
  }

  private _tokenWasClosure = (lastQueued: number[]): boolean => {
    return lastQueued[lastQueued.length - 1] === -2;
  };

  private _tokenWasOpening = (lastQueued: number[]): boolean => {
    return lastQueued[0] === -1;
  };

  private _cleanEmit = (emit: number[]): number[] => {
    return emit.filter((b) => b !== -1 && b !== -2);
  };

  private _outQ: number[][] = [];
  push(int: number): number[] | null {
    // If we buffered multiple emissions earlier, serve one immediately
    if (this._outQ.length) {
      const next = this._outQ.shift()!;
      return this._cleanEmit(next);
    }

    const token = this._innerLZS.push(int);
    if (!token) return null;

    // Inject boundary sentinels
    token.unshift(-1);
    token.push(-2);

    // Feed the augmented token to the outer LZS
    for (const v of token) {
      const emitted = super.push(v);
      if (emitted) {
        const lastQueued = this._outQ.pop();

        if (!lastQueued) {
          this._outQ.push(emitted);
          continue;
        }

        // Reward consistent boundaries with a merge
        if (
          this._tokenWasClosure(lastQueued) &&
          !this._tokenWasOpening(lastQueued)
        ) {
          const secondLastQueued = this._outQ.pop();
          if (secondLastQueued) {
            this._outQ.push([...secondLastQueued, ...lastQueued]);
          }
          this._outQ.push(emitted);
          continue;
        }

        if (
          this._tokenWasOpening(lastQueued) &&
          !this._tokenWasClosure(lastQueued)
        ) {
          // Merge emitted into last queued
          this._outQ.push([...lastQueued, ...emitted]);
          continue;
        } else {
          this._outQ.push(emitted);
          continue;
        }
      }
    }

    // Return the first emission now (continuous stream),
    // leave the rest in the queue for subsequent calls.
    if (this._outQ.length) {
      const first = this._outQ.shift()!;
      return this._cleanEmit(first);
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
      current: [
        ...innerFlushResults,
        ...(this._outQ.length ? this._outQ.map(this._cleanEmit) : []),
      ],
    };
  };
}
