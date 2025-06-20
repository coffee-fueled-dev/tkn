import { variables } from "../environment";
import type { MessageBuffer } from "./message-buffer";
import { TknMiner } from "./miner";
import { SymbolTable } from "./symbol-table";
import { processBatch } from "./process-batch";
import { randomUUIDv7 } from "bun";
import { createMessageBuffer } from "./message-buffer";
import { PROTOCOL_HEADER_SIZE } from "./process-batch";
import { memgraphDriver, MemgraphManager } from "./memgraph";
import { TknMetricsClient } from "./metrics-client";
import type { BatchItem } from "./parse-to-batch";

/**
 * Preload symbol table with high-confidence tokens from the database
 */
async function preloadSymbolTable(
  symbolTable: SymbolTable,
  memgraphManager: MemgraphManager
): Promise<void> {
  try {
    // TODO: Implement PageRank query to get high-confidence tokens
    // For now, this is a placeholder that will be implemented in step 2
    console.info(
      "🔄 Symbol table preloading placeholder - will implement PageRank query next"
    );

    // Simulate some preloading work
    await new Promise((resolve) => setTimeout(resolve, 100));

    // In the next step, we'll implement:
    // 1. Query database for tokens with highest PageRank scores
    // 2. Load them into the symbol table
    // 3. Set up the initial state for faster processing
  } catch (error) {
    console.error("Failed to preload symbol table:", error);
    throw error;
  }
}

export type SocketData = {
  sessionId: string;
  tknMiner: TknMiner;
  memgraphManager: MemgraphManager;
  symbolTable: SymbolTable;
  messageBuffer: MessageBuffer;
  processingQueue: BatchItem[];
  isProcessing: boolean;
  sessionStartTime: number; // Just for basic session duration tracking
  metricsClient: TknMetricsClient; // One metrics client per session
};

export const startSocketServer = () =>
  Bun.listen<SocketData>({
    hostname: "0.0.0.0",
    port: variables.TKN_PORT + 1,
    socket: {
      data(socket, data) {
        processBatch(socket, data);
      },
      async open(socket) {
        const sessionId = randomUUIDv7();
        const symbolTable = new SymbolTable();
        const tknMiner = new TknMiner();
        const metricsClient = new TknMetricsClient();
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
          metricsClient,
        };

        console.info(`🔗 Session ${sessionId} connected`);

        // Preload symbol table with high-confidence tokens
        try {
          console.info(
            `⏳ Preloading symbol table for session ${sessionId}...`
          );
          await preloadSymbolTable(symbolTable, memgraphManager);
          console.info(`✅ Symbol table preloaded for session ${sessionId}`);

          // Send session start event to metrics server
          metricsClient.sessionStart(sessionId, {
            preloadCompleted: true,
          });

          // Send READY signal to client
          socket.write("READY");
        } catch (error) {
          console.error(
            `❌ Failed to preload symbol table for session ${sessionId}:`,
            error
          );

          // Send session start event even if preload failed
          metricsClient.sessionStart(sessionId, {
            preloadCompleted: false,
            preloadError:
              error instanceof Error ? error.message : String(error),
          });

          // Send READY anyway to not block the client, but log the error
          socket.write("READY");
        }
      },
      async close(socket) {
        const { sessionId, memgraphManager } = socket.data;

        // Wait for any remaining processing to complete before cleanup
        while (
          socket.data.isProcessing ||
          socket.data.processingQueue.length > 0
        ) {
          console.log(
            `Waiting for session ${sessionId} to finish processing queue (${socket.data.processingQueue.length} items remaining)...`
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms and check again
        }

        // Wait for all Memgraph operations to complete
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

        // Mark session as completed in the graph database
        try {
          await memgraphManager.markSessionCompleted();
        } catch (err) {
          console.error(
            `Failed to mark session ${sessionId} as completed:`,
            err
          );
        }

        // Send session end event to metrics server
        const sessionDuration =
          performance.now() - socket.data.sessionStartTime;
        socket.data.metricsClient.sessionEnd(sessionId, {
          sessionDuration: sessionDuration / 1000, // Convert to seconds
        });

        // Disconnect the metrics client for this session
        await socket.data.metricsClient.disconnect();

        // Log session completion
        console.info(
          `📋 Session ${sessionId} completed (${(
            sessionDuration / 1000
          ).toFixed(2)}s)`
        );

        socket.data.symbolTable.clear();
        socket.data.messageBuffer.clear();

        console.info(`🔌 Session ${sessionId} disconnected`);
      },
      error(err) {
        console.error("❌ Socket error:", err);
      },
    },
  });
