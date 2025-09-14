/**
 * Unicode-aware text reader that yields codepoints instead of UTF-8 bytes
 */
export class UnicodeReader {
  /**
   * Convert a text string into an array of Unicode codepoints
   * Each codepoint is a number that represents one logical character
   */
  static stringToCodepoints(text: string): number[] {
    const codepoints: number[] = [];
    for (const char of text) {
      codepoints.push(char.codePointAt(0)!);
    }
    return codepoints;
  }

  /**
   * Convert an array of Unicode codepoints back to a string
   */
  static codepointsToString(codepoints: number[]): string {
    return String.fromCodePoint(...codepoints);
  }

  /**
   * Convert an array of Unicode codepoints to UTF-8 bytes
   * This is needed when storing tokens in the lattice as hex-encoded bytes
   */
  static codepointsToUtf8Bytes(codepoints: number[]): number[] {
    const text = String.fromCodePoint(...codepoints);
    const encoder = new TextEncoder();
    return Array.from(encoder.encode(text));
  }

  /**
   * Read file as Unicode codepoints instead of UTF-8 bytes
   */
  static async readFileAsCodepoints(filePath: string) {
    const file = Bun.file(filePath);
    const exists = await file.exists();
    if (!exists) {
      console.error({ filePath }, "Corpus file not found");
      process.exit(1);
    }

    console.info({ fileSize: file.size }, "Processing corpus file as Unicode");

    // Read entire file as text, then convert to codepoints
    const text = await file.text();
    const codepoints = this.stringToCodepoints(text);

    // Create an async iterable that yields chunks of codepoints
    const asyncIterable = {
      async *[Symbol.asyncIterator]() {
        const chunkSize = 8192; // Yield in chunks for memory efficiency
        for (let i = 0; i < codepoints.length; i += chunkSize) {
          yield codepoints.slice(i, i + chunkSize);
        }
      },
    };

    return {
      stream: asyncIterable,
      size: codepoints.length, // Now counts characters, not bytes
      text, // Also provide original text for debugging
    };
  }
}
