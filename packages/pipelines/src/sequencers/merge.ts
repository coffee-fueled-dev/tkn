import {
  isISequencer,
  type ISequencer,
  type ISequencerConfig,
} from "@tkn/sequencer";
import { IntSequencer } from "./int";

// ---- Uint8 helpers (number<->byteSeq) ----
// Same encoding semantics as your Uint8 class, but with zero-allocation pack from number[]
// and a lightweight decoder that avoids constructing a Uint8Array.
export class Uint8 {
  // BIG-ENDIAN, NUMBER-ONLY (safe while total bits ≤ 53)
  // Max data length is 5 bytes (because we add 1 byte for length → 6 bytes total = 48 bits).
  static toNumberFromArray(arr: number[], start = 0, end = arr.length): number {
    const len = end - start;
    if (len > 5) throw new Error("Too long: max data length is 5 bytes.");
    let v = 0;
    for (let i = start; i < end; i++) v = v * 256 + (arr[i] & 0xff);
    return v * 256 + len; // append length as lowest byte
  }

  /** Read encoded length from lowest byte (no allocation). */
  static encodedLen(v: number): number {
    return v & 0xff;
  }

  /** Decode into a provided number[] at a given offset. Returns new offset. */
  static decodeInto(v: number, out: number[], offset: number): number {
    let len = v & 0xff;
    v = Math.floor(v / 256);
    // Write big-endian bytes
    const idxEnd = offset + len;
    for (let i = idxEnd - 1; i >= offset; i--) {
      out[i] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return idxEnd;
  }
}

/** Optional: incremental packer for short (≤5) byte sequences → JS number. */
class IncrementalUint8NumberPacker {
  private _value = 0; // accumulated big-endian data bytes (no length yet)
  private _len = 0; // number of data bytes (max 5)

  reset() {
    this._value = 0;
    this._len = 0;
  }

  /** Try to append a byte (0–255). Returns false if it would overflow (>5). */
  pushByte(b: number): boolean {
    if (this._len >= 5) return false;
    this._value = this._value * 256 + (b & 0xff);
    this._len++;
    return true;
  }

  /** Finish and get encoded number (data bytes then 1 length byte). */
  finish(): number {
    if (this._len === 0) return 0x00; // encodes empty payload, length=0
    return this._value * 256 + this._len;
  }

  get length() {
    return this._len;
  }
}

export interface IMergeSequencerConfig extends ISequencerConfig {
  innerSequencer: ISequencer | ISequencerConfig;
}

/**
 * NGramSequencer encourages inner-word merges by hashing and reprocessing
 * the byte chunks emitted by the inner sequencer as integers.
 */
export class MergeSequencer extends IntSequencer implements ISequencer {
  private _innerSequencer: ISequencer;
  private _packer = new IncrementalUint8NumberPacker(); // reusable, avoids allocs

  constructor({ innerSequencer, ...config }: IMergeSequencerConfig) {
    super(config);
    this._innerSequencer = isISequencer(innerSequencer)
      ? innerSequencer
      : new IntSequencer(innerSequencer);
  }

  push(int: number): number[] | void {
    const token = this._innerSequencer.push(int);
    if (!token) return;

    let nGram: number[] | void = void 0;

    // Fast-path: small token (<5 bytes) → pack to a single number without allocating Uint8Array
    if (token.length < 5) {
      const packed = Uint8.toNumberFromArray(token);
      nGram = super.push(packed);
    } else {
      // Feed bytes directly
      for (let i = 0; i < token.length; i++) {
        nGram = super.push(token[i]);
      }
    }

    if (!nGram) return;

    // Expand any packed ints (>=257) back to raw bytes, single allocation.
    return this._expandCandidates(nGram);
  }

  flush = (): number[][] => {
    const results: number[][] = [];

    // Flush inner first to maintain order
    const inner = this._innerSequencer.flush();
    if (inner && inner.length) {
      for (let t = 0; t < inner.length; t++) {
        const token = inner[t];
        for (let i = 0; i < token.length; i++) {
          const emitted = super.push(token[i]);
          if (emitted) results.push(this._expandCandidates(emitted));
        }
      }
    }

    // Flush outer
    const outer = super.flush();
    if (outer && outer.length) {
      for (let i = 0; i < outer.length; i++) {
        results.push(this._expandCandidates(outer[i]));
      }
    }

    return results;
  };

  snapshot = async () => {
    const [outerSnapshot, innerSnapshot] = await Promise.all([
      super.snapshot(),
      this._innerSequencer.snapshot(),
    ]);
    return [...outerSnapshot, ...innerSnapshot];
  };

  // --- helpers ---

  /**
   * Expand a candidate token: ints <257 pass through; ints >=257 are packed sequences.
   * We first compute total length, allocate once, then fill.
   */
  private _expandCandidates(candidate: number[]): number[] {
    // First pass: measure
    let total = 0;
    for (let i = 0; i < candidate.length; i++) {
      const v = candidate[i];
      total += v >= 257 ? Uint8.encodedLen(v) : 1;
    }

    // Second pass: fill
    const out = new Array<number>(total);
    let off = 0;
    for (let i = 0; i < candidate.length; i++) {
      const v = candidate[i];
      if (v >= 257) {
        off = Uint8.decodeInto(v, out, off);
      } else {
        out[off++] = v;
      }
    }
    return out;
  }
}
