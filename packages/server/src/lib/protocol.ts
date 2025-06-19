import { hello } from "../metrics/logs";
import { TknMiner } from "./miner";
import { SymbolTable } from "./symbol-table";
import type { Socket } from "bun";
import { SyncStream } from "../memgraph/sync-stream";
import { recordOperation } from "../metrics";

// Type definitions
export type SocketData = {
  sessionId: string;
  tknMiner: TknMiner;
  syncStream: SyncStream;
  symbolTable: SymbolTable;
  buffer: Uint8Array; // Buffer to collect fragmented messages
  bufferSize: number; // Current size of data in buffer
};

// Protocol constants
export const PROTOCOL_HEADER_SIZE = 5; // 1 byte type + 4 bytes length
export const TYPE_JSON = 1;
export const TYPE_STRING = 2;
export const TYPE_BINARY = 3;
export const TYPE_BATCH = 4;

/**
 * Process buffer to extract complete messages based on protocol
 */
export function processBuffer(socket: Socket<SocketData>): void {
  const { buffer, bufferSize } = socket.data;

  // Keep processing while we have at least a header worth of data
  while (socket.data.bufferSize >= PROTOCOL_HEADER_SIZE) {
    // Read message type (first byte)
    const messageType = buffer[0];

    // Read message length (next 4 bytes, big-endian)
    const messageLength =
      (buffer[1] << 24) | (buffer[2] << 16) | (buffer[3] << 8) | buffer[4];

    // If we don't have the complete message yet, wait for more data
    if (socket.data.bufferSize < PROTOCOL_HEADER_SIZE + messageLength) {
      break;
    }

    // We have a complete message, extract it
    const messageData = buffer.subarray(
      PROTOCOL_HEADER_SIZE,
      PROTOCOL_HEADER_SIZE + messageLength
    );

    // Process the message based on its type
    processMessage(socket, messageType, messageData);

    // Remove processed message from buffer
    socket.data.buffer.copyWithin(
      0,
      PROTOCOL_HEADER_SIZE + messageLength,
      socket.data.bufferSize
    );
    socket.data.bufferSize -= PROTOCOL_HEADER_SIZE + messageLength;
  }
}

/**
 * Process an individual message based on its type
 */
export function processMessage(
  socket: Socket<SocketData>,
  messageType: number,
  data: Uint8Array
): void {
  const symbolTable = socket.data.symbolTable;
  let parsedData: any;

  // Parse data based on message type
  switch (messageType) {
    case TYPE_JSON:
      try {
        const jsonStr = new TextDecoder().decode(data);
        parsedData = JSON.parse(jsonStr);
        hello.server.debug("Received JSON data");
      } catch (err) {
        hello.server.error(
          "Error parsing JSON:",
          { messageType, dataLength: data.length },
          err instanceof Error ? err : new Error(String(err))
        );
        return;
      }
      break;

    case TYPE_STRING:
      parsedData = new TextDecoder().decode(data);
      hello.server.debug("Received string data");
      break;

    case TYPE_BINARY:
      // For binary data, we can process it as individual bytes or as a whole
      parsedData = Array.from(data);
      hello.server.debug("Received binary data");
      break;

    case TYPE_BATCH:
      // Process batch data - extract and process each item
      hello.server.debug("Received batch data");
      processBatchMessage(socket, data);
      return; // Batch processing is handled separately, so return early

    default:
      hello.server.error(`Unknown message type: ${messageType}`, {
        messageType,
      });
      return;
  }

  // Now hash the properly parsed data
  const hashedValues = Array.isArray(parsedData)
    ? parsedData.map((item) => symbolTable.getHash(item))
    : [symbolTable.getHash(parsedData)];

  // Process the hashed values with the tkn miner
  socket.data.tknMiner.transform(hashedValues, (err, token) => {
    if (err) {
      hello.server.error(
        "Error transforming data:",
        { sessionId: socket.data.sessionId },
        err instanceof Error ? err : new Error(String(err))
      );
    } else if (token) {
      socket.data.syncStream.process(token);
    }
  });
}

/**
 * Process a batch message containing multiple items
 */
export function processBatchMessage(
  socket: Socket<SocketData>,
  batchData: Uint8Array
): void {
  let offset = 0;
  const items: { type: number; data: Uint8Array }[] = [];

  // Extract each item from the batch
  while (offset < batchData.length) {
    // Need at least 5 bytes for an item header (1 type + 4 length)
    if (offset + PROTOCOL_HEADER_SIZE > batchData.length) {
      hello.server.error("Incomplete batch item header", {
        offset,
        batchDataLength: batchData.length,
      });
      break;
    }

    // Extract item type and length
    const itemType = batchData[offset];
    const itemLength =
      (batchData[offset + 1] << 24) |
      (batchData[offset + 2] << 16) |
      (batchData[offset + 3] << 8) |
      batchData[offset + 4];

    offset += PROTOCOL_HEADER_SIZE;

    // Check if we have the complete item
    if (offset + itemLength > batchData.length) {
      hello.server.error("Incomplete batch item data", {
        offset,
        itemLength,
        batchDataLength: batchData.length,
      });
      break;
    }

    // Extract the item data
    const itemData = batchData.subarray(offset, offset + itemLength);

    // Store the item for processing
    items.push({ type: itemType, data: itemData });

    // Move to the next item
    offset += itemLength;
  }

  hello.server.debug(`Processing ${items.length} items from batch`);

  // Process each item in the batch
  for (const item of items) {
    processMessage(socket, item.type, item.data);
  }
}

/**
 * Handle incoming data by appending to buffer and processing
 */
export function handleData(socket: Socket<SocketData>, data: any): void {
  const startTime = performance.now();
  socket.write(`${socket.data.sessionId}: ack`);

  try {
    // Convert data to Uint8Array regardless of input type
    const dataArray = data instanceof Uint8Array ? data : new Uint8Array(data);
    const dataLength = dataArray.byteLength;

    // Append new data to existing buffer
    if (socket.data.bufferSize + dataLength > socket.data.buffer.length) {
      // Grow buffer if needed
      const newBuffer = new Uint8Array(
        Math.max(
          socket.data.bufferSize + dataLength,
          socket.data.buffer.length * 2
        )
      );
      newBuffer.set(socket.data.buffer.subarray(0, socket.data.bufferSize));
      socket.data.buffer = newBuffer;
    }
    socket.data.buffer.set(dataArray, socket.data.bufferSize);
    socket.data.bufferSize += dataLength;

    // Process complete messages
    processBuffer(socket);
  } catch (err) {
    hello.server.error(
      "Error processing data:",
      { sessionId: socket.data.sessionId, dataLength: data?.length || 0 },
      err instanceof Error ? err : new Error(String(err))
    );
    recordOperation(
      "server",
      "socket-data-processing",
      performance.now() - startTime,
      true
    );
  }
}
