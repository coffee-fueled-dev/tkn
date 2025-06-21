const HEADER_SIZE = 5;
const BUFFER_SIZE = 8192;

export interface Message {
  type: number;
  data: Uint8Array;
}

export class MessageBuffer {
  private buffer: Uint8Array;
  private bufferSize: number;
  private readonly headerSize: number;

  constructor(initialSize: number = 8192, headerSize: number = 5) {
    this.buffer = new Uint8Array(initialSize);
    this.bufferSize = 0;
    this.headerSize = headerSize;
  }

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

  extractMessage(): Message | null {
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

export function createMessageBuffer(
  initialSize: number = BUFFER_SIZE,
  headerSize: number = HEADER_SIZE
): MessageBuffer {
  return new MessageBuffer(initialSize, headerSize);
}
