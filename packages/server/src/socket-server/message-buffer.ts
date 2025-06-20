/**
 * Simple message buffer for handling binary protocol parsing
 * Handles length-prefixed messages with automatic buffer management
 */
export class MessageBuffer {
  private buffer: Uint8Array;
  private bufferSize: number;
  private readonly headerSize: number;

  constructor(initialSize: number = 8192, headerSize: number = 5) {
    this.buffer = new Uint8Array(initialSize);
    this.bufferSize = 0;
    this.headerSize = headerSize;
  }

  /**
   * Add data to the buffer
   */
  push(data: Uint8Array): void {
    const dataLength = data.byteLength;

    if (this.bufferSize + dataLength > this.buffer.length) {
      const newBuffer = new Uint8Array(
        Math.max(this.bufferSize + dataLength, this.buffer.length * 2)
      );
      newBuffer.set(this.buffer.subarray(0, this.bufferSize));
      this.buffer = newBuffer;
    }

    this.buffer.set(data, this.bufferSize);
    this.bufferSize += dataLength;
  }

  /**
   * Try to extract the next complete message
   * Returns null if no complete message is available
   */
  extractMessage(): { type: number; data: Uint8Array } | null {
    if (this.bufferSize < this.headerSize) {
      return null;
    }

    const messageType = this.buffer[0];
    const messageLength =
      (this.buffer[1] << 24) |
      (this.buffer[2] << 16) |
      (this.buffer[3] << 8) |
      this.buffer[4];

    const totalMessageSize = this.headerSize + messageLength;

    if (this.bufferSize < totalMessageSize) {
      return null;
    }

    const messageData = this.buffer.subarray(this.headerSize, totalMessageSize);

    this.buffer.copyWithin(0, totalMessageSize, this.bufferSize);
    this.bufferSize -= totalMessageSize;

    return {
      type: messageType,
      data: messageData,
    };
  }

  get size(): number {
    return this.bufferSize;
  }

  clear(): void {
    this.bufferSize = 0;
  }

  get isEmpty(): boolean {
    return this.bufferSize === 0;
  }
}

/**
 * Create a new MessageBuffer instance
 */
export function createMessageBuffer(
  initialSize?: number,
  headerSize?: number
): MessageBuffer {
  return new MessageBuffer(initialSize, headerSize);
}

/**
 * Message extracted from buffer
 */
export interface ExtractedMessage {
  type: number;
  data: Uint8Array;
}
