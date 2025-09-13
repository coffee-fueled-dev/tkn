export class Hex {
  /**
   * Convert a Uint8Array or number[] into a literal escaped string.
   *
   * Example: [188, 189, 186, 170] =>
   *   "\\xBC\\xBD\\xBA\\xAA"
   */
  static fromBytes(input: Uint8Array | number[]): string {
    const arr = input instanceof Uint8Array ? input : Uint8Array.from(input);
    let out = "";
    for (let i = 0; i < arr.length; i++) {
      out += "\\x" + arr[i].toString(16).padStart(2, "0").toUpperCase();
    }
    return out;
  }

  /**
   * Convert a literal escaped string into a Uint8Array or number[].
   *
   * Example: "\\xBC\\xBD\\xBA\\xAA" => [188, 189, 186, 170]
   */
  static toBytes(s: string): number[] {
    const out: number[] = [];
    // every token is 4 chars: backslash, 'x', hex1, hex2
    for (let i = 0; i + 3 < s.length; i += 4) {
      // expecting \xHH (literal backslash)
      // no-throw parsing in case of noise
      const c0 = s.charCodeAt(i);
      const c1 = s.charCodeAt(i + 1);
      if (c0 !== 92 /*'\'*/ || c1 !== 120 /*'x'*/) break;
      const hex = s.slice(i + 2, i + 4);
      const v = parseInt(hex, 16);
      if (Number.isFinite(v)) out.push(v);
      else break;
    }
    return out;
  }
}
