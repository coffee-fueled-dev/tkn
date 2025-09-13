export class Uint8 {
  static toUint8Array(v: number): Uint8Array {
    const len = v % 256; // read length from lowest byte
    v = Math.floor(v / 256);
    const out = new Uint8Array(len);
    for (let i = len - 1; i >= 0; i--) {
      // pull bytes back (big-endian)
      out[i] = v % 256;
      v = Math.floor(v / 256);
    }
    return out;
  }

  // BIG-ENDIAN, NUMBER-ONLY (safe while total bits ≤ 53)
  // Max data length is 5 bytes (because we add 1 byte for length → 6 bytes total = 48 bits).
  static toNumber(arr: Uint8Array): number {
    if (arr.length > 5) {
      throw new Error(
        "Too long for number-only scheme: max data length is 5 bytes."
      );
    }
    let v = 0;
    for (const b of arr) v = v * 256 + b; // append data bytes
    v = v * 256 + arr.length; // append length as final (lowest) byte
    return v;
  }
}
