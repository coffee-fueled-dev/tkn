import { hello, sayHello } from "./logs";
import { TknMiner } from "./tkn-miner";
import { SymbolTable } from "./symbol-table";
import { neo4jDriver } from "./clients";
import { randomUUIDv7, type TCPSocketListener, type Socket } from "bun";
import { metricsServer } from "./metrics-server";
import { env } from "./env";
import { recordOperation } from "./throughput-monitor";
import { SyncStream } from "./sync-stream";
type SocketData = {
  sessionId: string;
  tknMiner: TknMiner;
  syncStream: SyncStream;
  symbolTable: SymbolTable;
  buffer: Uint8Array; // Buffer to collect fragmented messages
  bufferSize: number; // Current size of data in buffer
};

// Simple protocol constants
const PROTOCOL_HEADER_SIZE = 5; // 1 byte type + 4 bytes length
const TYPE_JSON = 1;
const TYPE_STRING = 2;
const TYPE_BINARY = 3;
const TYPE_BATCH = 4;

export const TknServer = () => {
  sayHello();

  hello.server.info("Starting server");

  const server = Bun.listen<SocketData>({
    hostname: "localhost",
    port: env.TKN_PORT,
    socket: {
      data(socket, data) {
        const startTime = performance.now();
        socket.write(`${socket.data.sessionId}: ack`);

        try {
          // Append new data to existing buffer
          if (
            socket.data.bufferSize + data.byteLength >
            socket.data.buffer.length
          ) {
            // Grow buffer if needed
            const newBuffer = new Uint8Array(
              Math.max(
                socket.data.bufferSize + data.byteLength,
                socket.data.buffer.length * 2
              )
            );
            newBuffer.set(
              socket.data.buffer.subarray(0, socket.data.bufferSize)
            );
            socket.data.buffer = newBuffer;
          }
          socket.data.buffer.set(new Uint8Array(data), socket.data.bufferSize);
          socket.data.bufferSize += data.byteLength;

          // Process complete messages
          processBuffer(socket);
        } catch (err) {
          hello.server.error("Error processing data:", err);
          recordOperation(
            "server",
            "socket-data-processing",
            performance.now() - startTime,
            true
          );
        }
      },
      open(socket) {
        const startTime = performance.now();
        sayHello();
        hello.server.debug("New connection");
        const sessionId = randomUUIDv7();
        const symbolTable = new SymbolTable();
        socket.data = {
          sessionId,
          tknMiner: new TknMiner(),
          syncStream: new SyncStream(sessionId, neo4jDriver, symbolTable),
          symbolTable,
          buffer: new Uint8Array(8192), // Initial 8K buffer
          bufferSize: 0,
        };
        recordOperation(
          "server",
          "connection-opened",
          performance.now() - startTime,
          false
        );
      },
      error(socket, err) {
        sayHello();
        hello.server.error("Error:", err);
      },
    },
  });
  hello.server.info(`Server listening at ${server.hostname}:${server.port}`);

  // Process buffer to extract complete messages based on protocol
  function processBuffer(socket: Socket<SocketData>) {
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

  // Process an individual message based on its type
  function processMessage(
    socket: Socket<SocketData>,
    messageType: number,
    data: Uint8Array
  ) {
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
          hello.server.error("Error parsing JSON:", err);
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
        hello.server.error(`Unknown message type: ${messageType}`);
        return;
    }

    // Now hash the properly parsed data
    const hashedValues = Array.isArray(parsedData)
      ? parsedData.map((item) => symbolTable.getHash(item))
      : [symbolTable.getHash(parsedData)];

    // Process the hashed values with the tkn miner
    socket.data.tknMiner.transform(hashedValues, (err, token) => {
      if (err) {
        hello.server.error("Error transforming data:", err);
      } else if (token) {
        socket.data.syncStream.process(token);
      }
    });
  }

  // Process a batch message containing multiple items
  function processBatchMessage(
    socket: Socket<SocketData>,
    batchData: Uint8Array
  ) {
    let offset = 0;
    const items: { type: number; data: Uint8Array }[] = [];

    // Extract each item from the batch
    while (offset < batchData.length) {
      // Need at least 5 bytes for an item header (1 type + 4 length)
      if (offset + PROTOCOL_HEADER_SIZE > batchData.length) {
        hello.server.error("Incomplete batch item header");
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
        hello.server.error("Incomplete batch item data");
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

  const shutdown = () => {
    hello.server.info("Shutting down server...");
    server.stop(true);
    metricsServer.server.stop(true);
    neo4jDriver.close();
    hello.server.info("Server shutdown complete");
  };

  return {
    server,
    metricsServer,
    shutdown,
  };
};
