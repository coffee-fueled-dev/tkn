export class Decoder {
  constructor(private readonly textDecoder: TextDecoder) {}

  /**
   * Construct a human-readable token value from bytes with proper handling
   * of UTF-8, control characters, and invalid sequences
   */
  private constructTokenValue(buffer: Uint8Array): string {
    // Handle single bytes specially
    if (buffer.length === 1) {
      const byte = buffer[0];

      // Control characters (0-31, 127)
      if (byte < 32 || byte === 127) {
        return this.formatControlCharacter(byte);
      }

      // Regular ASCII (32-126)
      if (byte < 128) {
        return String.fromCharCode(byte);
      }

      // Single high byte (invalid UTF-8 start)
      return `[BYTE:0x${byte.toString(16).padStart(2, "0").toUpperCase()}]`;
    }

    // Multi-byte sequences
    try {
      // Try to decode as UTF-8 with fatal error handling
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(buffer);

      // Check if the decoded string contains only control characters
      if (
        decoded.length > 0 &&
        decoded.split("").every((char) => char.charCodeAt(0) < 32)
      ) {
        return this.formatControlSequence(buffer);
      }

      return decoded;
    } catch (error) {
      // Invalid UTF-8 sequence - show as hex
      return this.formatHexSequence(buffer);
    }
  }

  /**
   * Format single control characters with descriptive names
   */
  private formatControlCharacter(byte: number): string {
    const controlNames: { [key: number]: string } = {
      0: "NULL",
      1: "SOH",
      2: "STX",
      3: "ETX",
      4: "EOT",
      5: "ENQ",
      6: "ACK",
      7: "BEL",
      8: "BS",
      9: "TAB",
      10: "LF",
      11: "VT",
      12: "FF",
      13: "CR",
      14: "SO",
      15: "SI",
      16: "DLE",
      17: "DC1",
      18: "DC2",
      19: "DC3",
      20: "DC4",
      21: "NAK",
      22: "SYN",
      23: "ETB",
      24: "CAN",
      25: "EM",
      26: "SUB",
      27: "ESC",
      28: "FS",
      29: "GS",
      30: "RS",
      31: "US",
      127: "DEL",
    };

    const name = controlNames[byte];
    if (name) {
      return `[${name}]`;
    }

    return `[CTRL:${byte}]`;
  }

  /**
   * Format sequences of control characters
   */
  private formatControlSequence(buffer: Uint8Array): string {
    const chars = Array.from(buffer).map((byte) => {
      if (byte < 32 || byte === 127) {
        return this.formatControlCharacter(byte);
      }
      return String.fromCharCode(byte);
    });

    return chars.join("");
  }

  /**
   * Format invalid UTF-8 sequences as hex
   */
  private formatHexSequence(buffer: Uint8Array): string {
    const hex = Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(" ");

    return `[HEX:${hex}]`;
  }

  /**
   * Decode a token buffer to a human-readable string
   */
  decodeToken(buffer: Uint8Array): string {
    return this.constructTokenValue(buffer);
  }
}
