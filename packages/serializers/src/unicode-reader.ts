/**
 * Unicode-aware text reader that yields codepoints instead of UTF-8 bytes
 */
export class Unicode {
  /**
   * Convert a text string into an array of Unicode codepoints
   * Each codepoint is a number that represents one logical character
   */
  static fromString(text: string): number[] {
    const codepoints: number[] = [];
    for (const char of text) {
      codepoints.push(char.codePointAt(0)!);
    }
    return codepoints;
  }

  /**
   * Convert an array of Unicode codepoints back to a string
   */
  static toString(codepoints: number[]): string {
    return String.fromCodePoint(...codepoints);
  }

  /**
   * Convert an array of Unicode codepoints to UTF-8 bytes
   * This is needed when storing tokens in the lattice as hex-encoded bytes
   */
  static toUtf8Bytes(codepoints: number[]): number[] {
    const text = String.fromCodePoint(...codepoints);
    const encoder = new TextEncoder();
    return Array.from(encoder.encode(text));
  }

  // Returns an async-iterable of codepoint chunks (number[])
  static async *stream(source: Bun.BunFile, chunkCP = 8192) {
    // fatal:true -> throw on malformed UTF-8 instead of inserting U+FFFD
    const textStream = source.stream().pipeThrough(new TextDecoderStream());

    let buf: number[] = [];
    for await (const str of textStream) {
      // Optional: normalize per-chunk if you want canonical stability
      // const s = str.normalize("NFC");
      const s = str;

      for (const ch of s) {
        buf.push(ch.codePointAt(0)!);
        if (buf.length >= chunkCP) {
          yield buf;
          buf = [];
        }
      }
    }

    if (buf.length) yield buf;
  }
}
