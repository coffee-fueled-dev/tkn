/**
 * TKN Common - Shared types, constants, and utilities for the TKN protocol
 */

// Protocol constants
export const PROTOCOL_HEADER_SIZE = 5; // 1 byte type + 4 bytes length
export const TYPE_JSON = 1;
export const TYPE_STRING = 2;
export const TYPE_BINARY = 3;
export const TYPE_BATCH = 4; // New batch type

export type TknMessageType =
  | typeof TYPE_JSON
  | typeof TYPE_STRING
  | typeof TYPE_BINARY
  | typeof TYPE_BATCH; // Added batch type
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
  // Handle batch type separately
  if (type === TYPE_BATCH) {
    return encodeBatchMessage(data as TknBatchItem[]);
  }

  // Convert data to binary format if needed
  let binaryData: Uint8Array;

  if (type === TYPE_JSON) {
    const jsonStr = typeof data === "string" ? data : JSON.stringify(data);
    binaryData = new TextEncoder().encode(jsonStr);
  } else if (type === TYPE_STRING) {
    binaryData = new TextEncoder().encode(data as string);
  } else if (type === TYPE_BINARY) {
    binaryData = data as Uint8Array;
  } else {
    throw new Error(`Invalid message type: ${type}`);
  }

  // Create the message buffer with header + data
  const messageBuffer = new Uint8Array(
    PROTOCOL_HEADER_SIZE + binaryData.length
  );

  // Set message type (first byte)
  messageBuffer[0] = type;

  // Set message length (next 4 bytes, big-endian)
  const length = binaryData.length;
  messageBuffer[1] = (length >> 24) & 0xff;
  messageBuffer[2] = (length >> 16) & 0xff;
  messageBuffer[3] = (length >> 8) & 0xff;
  messageBuffer[4] = length & 0xff;

  // Copy the data
  messageBuffer.set(binaryData, PROTOCOL_HEADER_SIZE);

  return messageBuffer;
}

/**
 * Encode a batch message containing multiple items
 *
 * Batch format:
 * +------+----------------+--------------+--------------+...+--------------+--------------+
 * | Type | Total Length   | Item1 Type   | Item1 Length | ...| ItemN Type   | ItemN Length |
 * +------+----------------+--------------+--------------+...+--------------+--------------+
 * | Item1 Payload         | ... | ItemN Payload         |
 * +------------------------+...+------------------------+
 *
 * @param items Array of batch items {type, data}
 * @returns Encoded buffer ready to send
 */
function encodeBatchMessage(items: TknBatchItem[]): Uint8Array {
  if (!items.length) {
    throw new Error("Batch cannot be empty");
  }

  // First, encode each item to calculate total size
  const encodedItems: Uint8Array[] = [];
  let totalItemsSize = 0;

  for (const item of items) {
    // Encode each individual item (except batch type - that would be recursive)
    if (item.type === TYPE_BATCH) {
      throw new Error("Nested batches are not supported");
    }

    // Encode the item (without main header since we'll handle that specially)
    const encoded = encodeMessage(item.type, item.data);

    // We need the encoded data without its header, plus 5 bytes for item header in batch
    totalItemsSize += encoded.length - PROTOCOL_HEADER_SIZE + 5;
    encodedItems.push(encoded);
  }

  // Create the batch message buffer
  // Main header (5 bytes) + all items with their headers
  const batchBuffer = new Uint8Array(PROTOCOL_HEADER_SIZE + totalItemsSize);

  // Set batch type (first byte)
  batchBuffer[0] = TYPE_BATCH;

  // Set total length (next 4 bytes, big-endian)
  batchBuffer[1] = (totalItemsSize >> 24) & 0xff;
  batchBuffer[2] = (totalItemsSize >> 16) & 0xff;
  batchBuffer[3] = (totalItemsSize >> 8) & 0xff;
  batchBuffer[4] = totalItemsSize & 0xff;

  // Add each item to the batch
  let offset = PROTOCOL_HEADER_SIZE;

  for (const encoded of encodedItems) {
    // Get the item's type and data
    const itemType = encoded[0];
    const itemLength =
      (encoded[1] << 24) | (encoded[2] << 16) | (encoded[3] << 8) | encoded[4];
    const itemData = encoded.subarray(PROTOCOL_HEADER_SIZE);

    // Write item type and length to batch
    batchBuffer[offset++] = itemType;
    batchBuffer[offset++] = (itemLength >> 24) & 0xff;
    batchBuffer[offset++] = (itemLength >> 16) & 0xff;
    batchBuffer[offset++] = (itemLength >> 8) & 0xff;
    batchBuffer[offset++] = itemLength & 0xff;

    // Copy item data
    batchBuffer.set(itemData, offset);
    offset += itemData.length;
  }

  return batchBuffer;
}
