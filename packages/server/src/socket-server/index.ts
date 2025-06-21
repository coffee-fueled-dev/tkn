import { variables } from "../environment";
import type { Message, MessageBuffer } from "./message-buffer";
import { TknMiner } from "./miner";
import { SymbolTable } from "./symbol-table/symbol-table";
import { processBatch } from "./process-batch";
import { randomUUIDv7 } from "bun";
import { createMessageBuffer } from "./message-buffer";
import { PROTOCOL_HEADER_SIZE } from "./process-batch";
import { memgraphDriver, MemgraphManager } from "./memgraph";
import { parseMessage, type BatchItem } from "./parse-message";

export type SocketData = {
  sessionId: string;
  tknMiner: TknMiner;
  memgraphManager: MemgraphManager;
  symbolTable: SymbolTable;
  messageBuffer: MessageBuffer;
  processingQueue: BatchItem[];
  isProcessing: boolean;
  sessionStartTime: number;
  sessionBytesReceived: number;
  networkBytesReceived: number;
  operationCount: number;
  tokenCount: number;
  dataProcessingStartTime: number | null;
  dataReceptionEndTime: number | null;
  lastDataReceivedTime: number | null;
  processingCompletedTime: number | null;
};

export const startSocketServer = () =>
  Bun.listen<SocketData>({
    hostname: "0.0.0.0",
    port: variables.TKN_PORT + 1,
    socket: {
      data(socket, data) {
        // Track actual network bytes received
        const networkBytes =
          data instanceof Uint8Array ? data.length : Buffer.byteLength(data);
        socket.data.networkBytesReceived += networkBytes;

        // Track data reception timing
        const now = performance.now();
        if (socket.data.dataProcessingStartTime === null) {
          socket.data.dataProcessingStartTime = now;
          const sessionTime = now - socket.data.sessionStartTime;
          console.log(
            `📥 First data packet: ${networkBytes} bytes at session+${sessionTime.toFixed(
              2
            )}ms`
          );
        }
        socket.data.lastDataReceivedTime = now;

        // Log every data packet for debugging
        console.log(
          `📦 Data packet: ${networkBytes} bytes, Total: ${socket.data.networkBytesReceived} bytes`
        );

        socket.data.messageBuffer.push(data);

        let message;
        while (
          (message = socket.data.messageBuffer.extractMessage()) !== null
        ) {
          const items = parseMessage(message.data);
          processBatch(socket, items);
        }
      },
      async open(socket) {
        const sessionId = randomUUIDv7();
        const symbolTable = new SymbolTable();
        const tknMiner = new TknMiner();
        const memgraphManager = new MemgraphManager(
          sessionId,
          memgraphDriver,
          symbolTable
        );
        const messageBuffer = createMessageBuffer(8192, PROTOCOL_HEADER_SIZE);

        socket.data = {
          sessionId,
          tknMiner,
          memgraphManager,
          symbolTable,
          messageBuffer,
          processingQueue: [],
          isProcessing: false,
          sessionStartTime: performance.now(),
          sessionBytesReceived: 0,
          networkBytesReceived: 0,
          operationCount: 0,
          tokenCount: 0,
          dataProcessingStartTime: null,
          dataReceptionEndTime: null,
          lastDataReceivedTime: null,
          processingCompletedTime: null,
        };

        console.info(`🔗 Session ${sessionId} connected`);

        try {
          console.info(
            `⏳ Preloading symbol table for session ${sessionId}...`
          );

          socket.write("READY");
        } catch (error) {
          console.error(
            `❌ Failed to preload symbol table for session ${sessionId}:`,
            error
          );

          socket.write("READY");
        }
      },
      async close(socket) {
        const { sessionId, memgraphManager } = socket.data;

        // Mark end of data reception
        const closeTime = performance.now();
        if (socket.data.lastDataReceivedTime) {
          socket.data.dataReceptionEndTime = socket.data.lastDataReceivedTime;
          const sessionCloseTime = closeTime - socket.data.sessionStartTime;
          const sessionLastDataTime =
            socket.data.lastDataReceivedTime - socket.data.sessionStartTime;
          const gapBetweenLastDataAndClose =
            closeTime - socket.data.lastDataReceivedTime;
          console.log(
            `🔌 Connection closed at session+${sessionCloseTime.toFixed(
              2
            )}ms, last data at session+${sessionLastDataTime.toFixed(
              2
            )}ms (${gapBetweenLastDataAndClose.toFixed(2)}ms gap)`
          );
        }

        while (
          socket.data.isProcessing ||
          socket.data.processingQueue.length > 0
        ) {
          console.log(
            `Waiting for session ${sessionId} to finish processing queue (${socket.data.processingQueue.length} items remaining)...`
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms and check again
        }

        while (
          memgraphManager.isCurrentlyProcessing() ||
          memgraphManager.getQueueLength() > 0
        ) {
          console.log(
            `Waiting for session ${sessionId} to finish database operations (${Math.ceil(
              memgraphManager.getQueueLength() / 200
            )} operations remaining)...`
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms and check again
        }

        try {
          await memgraphManager.markSessionCompleted();
        } catch (err) {
          console.error(
            `Failed to mark session ${sessionId} as completed:`,
            err
          );
        }

        const now = performance.now();
        const sessionDuration = now - socket.data.sessionStartTime;
        const dataReceptionDuration =
          socket.data.dataReceptionEndTime &&
          socket.data.dataProcessingStartTime
            ? socket.data.dataReceptionEndTime -
              socket.data.dataProcessingStartTime
            : 0;
        const actualProcessingDuration =
          socket.data.processingCompletedTime &&
          socket.data.dataProcessingStartTime
            ? socket.data.processingCompletedTime -
              socket.data.dataProcessingStartTime
            : 0;

        const metrics = {
          sessionId,
          timing: {
            sessionDurationMs: sessionDuration,
            dataReceptionDurationMs: dataReceptionDuration,
            actualProcessingDurationMs: actualProcessingDuration,
            cleanupDurationMs:
              now - (socket.data.processingCompletedTime || now),
          },
          data: {
            sessionBytesReceived: socket.data.sessionBytesReceived,
            networkBytesReceived: socket.data.networkBytesReceived,
            operationCount: socket.data.operationCount,
            tokenCount: socket.data.tokenCount,
          },
          throughput: {
            dataReceptionRate:
              dataReceptionDuration > 0
                ? socket.data.sessionBytesReceived /
                  (dataReceptionDuration / 1000)
                : 0,
            networkReceptionRate:
              dataReceptionDuration > 0
                ? socket.data.networkBytesReceived /
                  (dataReceptionDuration / 1000)
                : 0,
            actualProcessingRate:
              actualProcessingDuration > 0
                ? socket.data.operationCount / (actualProcessingDuration / 1000)
                : 0,

            tokenGenerationRate:
              actualProcessingDuration > 0
                ? socket.data.tokenCount / (actualProcessingDuration / 1000)
                : 0,
          },
        };

        console.info(JSON.stringify(metrics, null, 2));

        socket.data.symbolTable.clear();
        socket.data.messageBuffer.clear();

        console.info(`🔌 Session ${sessionId} disconnected`);
      },
      error(err) {
        console.error("❌ Socket error:", err);
      },
    },
  });
