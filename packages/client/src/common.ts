/**
 * TKN Protocol - Binary message encoding utilities
 */

export const PROTOCOL_HEADER_SIZE = 5;
export const TYPE_JSON = 1;
export const TYPE_STRING = 2;
export const TYPE_BINARY = 3;
export const TYPE_BATCH = 4;

export type TknMessageType =
  | typeof TYPE_JSON
  | typeof TYPE_STRING
  | typeof TYPE_BINARY
  | typeof TYPE_BATCH;
export type TknData = string | object | Uint8Array;
export type TknBatchItem = { type: TknMessageType; data: TknData };

// Common interface for options - will be extended by platform-specific options
export interface TknClientOptionsBase {
  onConnect?: (client: any) => void;
  onData?: (data: any) => void;
  onError?: (error: any) => void;
  onClose?: (event?: any) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

/**
 * Encode a message according to the TKN protocol
 *
 * @param type Message type (1=JSON, 2=STRING, 3=BINARY, 4=BATCH)
 * @param data The data to send (string, object, Uint8Array, or array of batch items)
 * @returns Encoded buffer ready to send
 */
export function encodeMessage(
  type: TknMessageType,
  data: TknData | TknBatchItem[]
): Uint8Array {
  if (type === TYPE_BATCH) {
    return encodeBatchWithMultipleItems(data as TknBatchItem[]);
  }

  const binaryPayload = convertDataToBinaryPayload(type, data as TknData);
  return createMessageWithHeader(type, binaryPayload);
}

function convertDataToBinaryPayload(
  type: TknMessageType,
  data: TknData
): Uint8Array {
  if (type === TYPE_JSON) {
    return serializeJsonToBytes(data);
  }
  if (type === TYPE_STRING) {
    return encodeStringToBytes(data as string);
  }
  if (type === TYPE_BINARY) {
    return data as Uint8Array;
  }
  throw new Error(`Invalid message type: ${type}`);
}

function serializeJsonToBytes(data: TknData): Uint8Array {
  const jsonString = typeof data === "string" ? data : JSON.stringify(data);
  return new TextEncoder().encode(jsonString);
}

function encodeStringToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function createMessageWithHeader(
  type: TknMessageType,
  payload: Uint8Array
): Uint8Array {
  const messageBuffer = allocateMessageBuffer(payload.length);

  writeMessageTypeToBuffer(messageBuffer, type);
  writePayloadLengthToBuffer(messageBuffer, payload.length);
  writePayloadToBuffer(messageBuffer, payload);

  return messageBuffer;
}

function allocateMessageBuffer(payloadSize: number): Uint8Array {
  return new Uint8Array(PROTOCOL_HEADER_SIZE + payloadSize);
}

function writeMessageTypeToBuffer(
  buffer: Uint8Array,
  type: TknMessageType
): void {
  buffer[0] = type;
}

function writePayloadLengthToBuffer(buffer: Uint8Array, length: number): void {
  buffer[1] = (length >> 24) & 0xff;
  buffer[2] = (length >> 16) & 0xff;
  buffer[3] = (length >> 8) & 0xff;
  buffer[4] = length & 0xff;
}

function writePayloadToBuffer(buffer: Uint8Array, payload: Uint8Array): void {
  buffer.set(payload, PROTOCOL_HEADER_SIZE);
}

function encodeBatchWithMultipleItems(items: TknBatchItem[]): Uint8Array {
  validateBatchItems(items);

  const encodedItems = encodeEachBatchItem(items);
  const totalBatchSize = calculateTotalBatchSize(encodedItems);
  const batchBuffer = allocateMessageBuffer(totalBatchSize);

  writeBatchHeaderToBuffer(batchBuffer, totalBatchSize);
  writeBatchItemsToBuffer(batchBuffer, encodedItems);

  return batchBuffer;
}

function validateBatchItems(items: TknBatchItem[]): void {
  if (!items.length) {
    throw new Error("Batch cannot be empty");
  }

  for (const item of items) {
    if (item.type === TYPE_BATCH) {
      throw new Error("Nested batches are not supported");
    }
  }
}

function encodeEachBatchItem(items: TknBatchItem[]): Uint8Array[] {
  return items.map((item) => encodeMessage(item.type, item.data));
}

function calculateTotalBatchSize(encodedItems: Uint8Array[]): number {
  return encodedItems.reduce((total, encoded) => {
    return (
      total + (encoded.length - PROTOCOL_HEADER_SIZE + PROTOCOL_HEADER_SIZE)
    );
  }, 0);
}

function writeBatchHeaderToBuffer(buffer: Uint8Array, totalSize: number): void {
  writeMessageTypeToBuffer(buffer, TYPE_BATCH);
  writePayloadLengthToBuffer(buffer, totalSize);
}

function writeBatchItemsToBuffer(
  buffer: Uint8Array,
  encodedItems: Uint8Array[]
): void {
  let bufferOffset = PROTOCOL_HEADER_SIZE;

  for (const encodedItem of encodedItems) {
    bufferOffset = writeSingleBatchItemToBuffer(
      buffer,
      encodedItem,
      bufferOffset
    );
  }
}

function writeSingleBatchItemToBuffer(
  buffer: Uint8Array,
  encodedItem: Uint8Array,
  offset: number
): number {
  const itemType = extractItemTypeFromEncoded(encodedItem);
  const itemPayload = extractItemPayloadFromEncoded(encodedItem);

  writeItemHeaderToBuffer(buffer, offset, itemType, itemPayload.length);
  writeItemPayloadToBuffer(buffer, offset + PROTOCOL_HEADER_SIZE, itemPayload);

  return offset + PROTOCOL_HEADER_SIZE + itemPayload.length;
}

function extractItemTypeFromEncoded(encoded: Uint8Array): number {
  return encoded[0];
}

function extractItemPayloadFromEncoded(encoded: Uint8Array): Uint8Array {
  return encoded.subarray(PROTOCOL_HEADER_SIZE);
}

function writeItemHeaderToBuffer(
  buffer: Uint8Array,
  offset: number,
  type: number,
  length: number
): void {
  buffer[offset] = type;
  buffer[offset + 1] = (length >> 24) & 0xff;
  buffer[offset + 2] = (length >> 16) & 0xff;
  buffer[offset + 3] = (length >> 8) & 0xff;
  buffer[offset + 4] = length & 0xff;
}

function writeItemPayloadToBuffer(
  buffer: Uint8Array,
  offset: number,
  payload: Uint8Array
): void {
  buffer.set(payload, offset);
}
