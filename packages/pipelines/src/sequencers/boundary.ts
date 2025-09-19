import {
  isISequencer,
  type ISequencer,
  type ISequencerConfig,
} from "@tkn/sequencer";
import { IntSequencer } from "./int";

export interface IBoundarySequencerConfig extends ISequencerConfig {
  innerSequencer: ISequencer | ISequencerConfig;
}

/**
 * BoundarySequencer reinforces boundaries by rewarding consistently detected boundaries with extra merges
 */
export class BoundarySequencer extends IntSequencer implements ISequencer {
  private static readonly SENT_OPEN = -1;
  private static readonly SENT_CLOSE = -2;

  private _innerSequencer: ISequencer;

  // Output queue implemented as a ring buffer (avoid O(n) shift)
  private _outQ: number[][] = [];
  private _outHead = 0;

  constructor({ innerSequencer, ...config }: IBoundarySequencerConfig) {
    super(config);
    this._innerSequencer = isISequencer(innerSequencer)
      ? innerSequencer
      : new IntSequencer(innerSequencer);
  }

  // --- tiny helpers (on prototype, not per-instance closures) ---

  private _tokenWasClosure(arr: number[]): boolean {
    // arr is non-empty for our uses
    return arr[arr.length - 1] === BoundarySequencer.SENT_CLOSE;
  }

  private _tokenWasOpening(arr: number[]): boolean {
    return arr[0] === BoundarySequencer.SENT_OPEN;
  }

  /**
   * Return same reference if no sentinel is present; otherwise
   * allocate once and copy only non-sentinels.
   */
  private _cleanIfNeeded(arr: number[]): number[] {
    const OPEN = BoundarySequencer.SENT_OPEN;
    const CLOSE = BoundarySequencer.SENT_CLOSE;

    // Quick scan to see if cleaning is needed
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v === OPEN || v === CLOSE) {
        // Need to clean: copy skipping sentinels
        const out: number[] = new Array(arr.length); // upper bound
        let k = 0;
        for (let j = 0; j < arr.length; j++) {
          const x = arr[j];
          if (x !== OPEN && x !== CLOSE) out[k++] = x;
        }
        out.length = k; // trim
        return out;
      }
    }
    return arr;
  }

  /**
   * Append source into target in-place without spreading.
   */
  private _appendInto(target: number[], source: number[]): void {
    const tLen = target.length;
    const sLen = source.length;
    target.length = tLen + sLen;
    for (let i = 0; i < sLen; i++) {
      target[tLen + i] = source[i];
    }
  }

  /**
   * Ring-buffer dequeue; returns undefined if empty.
   */
  private _dequeue(): number[] | undefined {
    if (this._outHead >= this._outQ.length) return undefined;
    const item = this._outQ[this._outHead++];
    // Periodically compact to avoid unbounded growth
    if (this._outHead > 32 && this._outHead > this._outQ.length >>> 1) {
      this._outQ = this._outQ.slice(this._outHead);
      this._outHead = 0;
    }
    return item;
  }

  /**
   * Get last enqueued item without removing it.
   */
  private _peekLast(): number[] | undefined {
    return this._outQ.length > this._outHead
      ? this._outQ[this._outQ.length - 1]
      : undefined;
  }

  push(int: number): number[] | void {
    // Serve any buffered emissions immediately
    const queued = this._dequeue();
    if (queued) return this._cleanIfNeeded(queued);

    const innerToken = this._innerSequencer.push(int);
    if (!innerToken) return;

    // Feed boundary sentinels around the inner token without mutating it
    // Order: OPEN, ...innerToken, CLOSE
    // Note: we avoid for..of here for speed
    const OPEN = BoundarySequencer.SENT_OPEN;
    const CLOSE = BoundarySequencer.SENT_CLOSE;

    // feed OPEN
    {
      const emitted = super.push(OPEN);
      if (emitted) this._handleOuterEmission(emitted);
    }

    // feed token body
    for (let i = 0; i < innerToken.length; i++) {
      const emitted = super.push(innerToken[i]);
      if (emitted) this._handleOuterEmission(emitted);
    }

    // feed CLOSE
    {
      const emitted = super.push(CLOSE);
      if (emitted) this._handleOuterEmission(emitted);
    }

    // Return the first emission now (leave the rest queued)
    const first = this._dequeue();
    if (first) return this._cleanIfNeeded(first);
  }

  /**
   * Decide how to merge/queue an emitted outer token.
   * Mirrors your original logic, but avoids copies/spreads.
   */
  private _handleOuterEmission(emitted: number[]): void {
    const lastQueued = this._peekLast();
    if (!lastQueued) {
      this._outQ.push(emitted);
      return;
    }

    const lastWasClose = this._tokenWasClosure(lastQueued);
    const lastWasOpen = this._tokenWasOpening(lastQueued);

    // Reward consistent boundaries with a merge:
    // if last ended with CLOSE and didn't start with OPEN, merge it
    // with the one before it (2nd last), then push current emitted.
    if (lastWasClose && !lastWasOpen) {
      // pop last, merge it into second last if present
      const poppedLast = this._outQ.pop()!; // lastQueued
      const secondLast = this._peekLast();
      if (secondLast) {
        this._appendInto(secondLast, poppedLast);
      } else {
        // If no second last, just put it back
        this._outQ.push(poppedLast);
      }
      this._outQ.push(emitted);
      return;
    }

    // If last started with OPEN (and didn't end with CLOSE), merge new into last
    if (lastWasOpen && !this._tokenWasClosure(lastQueued)) {
      this._appendInto(lastQueued, emitted);
      return;
    }

    // Default: just enqueue
    this._outQ.push(emitted);
  }

  flush = (): number[][] => {
    const results: number[][] = [];

    // Flush inner first to maintain stream order
    const inner = this._innerSequencer.flush();
    if (inner && inner.length) {
      for (let t = 0; t < inner.length; t++) {
        const token = inner[t];
        for (let i = 0; i < token.length; i++) {
          const emitted = super.push(token[i]);
          if (emitted) results.push(this._cleanIfNeeded(emitted));
        }
      }
    }

    // Flush outer sequencer
    const outer = super.flush();
    if (outer && outer.length) {
      for (let i = 0; i < outer.length; i++) {
        results.push(this._cleanIfNeeded(outer[i]));
      }
    }

    // Drain remaining queue
    for (let i = this._outHead; i < this._outQ.length; i++) {
      results.push(this._cleanIfNeeded(this._outQ[i]));
    }
    this._outQ.length = 0;
    this._outHead = 0;

    return results;
  };

  snapshot = async () => {
    const [outerSnapshot, innerSnapshot] = await Promise.all([
      super.snapshot(),
      this._innerSequencer.snapshot(),
    ]);
    return [...outerSnapshot, ...innerSnapshot];
  };
}
