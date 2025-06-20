import { variables } from "../environment";
import type { MessageBuffer } from "./message-buffer";
import { TknMiner } from "./miner";
import { SymbolTable } from "./symbol-table";
import { processBatch } from "./process-batch";
import { randomUUIDv7 } from "bun";
import { createMessageBuffer } from "./message-buffer";
import { PROTOCOL_HEADER_SIZE } from "./process-batch";
import { memgraphDriver, MemgraphManager } from "./memgraph";
import { ProcessMonitor } from "./monitor";
import type { BatchItem } from "./parse-to-batch";

export type SocketData = {
  sessionId: string;
  tknMiner: TknMiner;
  memgraphManager: MemgraphManager;
  symbolTable: SymbolTable;
  messageBuffer: MessageBuffer;
  monitor: ProcessMonitor;
  processingQueue: BatchItem[];
  isProcessing: boolean;
};

export const startSocketServer = () =>
  Bun.listen<SocketData>({
    hostname: "0.0.0.0",
    port: variables.TKN_PORT + 1,
    socket: {
      data(socket, data) {
        processBatch(socket, data);
      },
      open(socket) {
        const sessionId = randomUUIDv7();
        const symbolTable = new SymbolTable();
        const tknMiner = new TknMiner();
        const memgraphManager = new MemgraphManager(
          sessionId,
          memgraphDriver,
          symbolTable
        );
        const messageBuffer = createMessageBuffer(8192, PROTOCOL_HEADER_SIZE);
        const monitor = new ProcessMonitor();

        socket.data = {
          sessionId,
          tknMiner,
          memgraphManager,
          symbolTable,
          messageBuffer,
          monitor,
          processingQueue: [],
          isProcessing: false,
        };

        console.info(`🔗 Session ${sessionId} connected`);
      },
      async close(socket) {
        const { sessionId, monitor } = socket.data;

        console.info(`🔌 Session ${sessionId} disconnected`);

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

        // Log session completion with formatted message
        console.info(
          `📋 Session ${sessionId} completed: ${monitor.getConsoleMessage()}`
        );

        socket.data.symbolTable.clear();
        socket.data.messageBuffer.clear();
        socket.data.monitor.reset();
      },
      error(err) {
        console.error("❌ Socket error:", err);
      },
    },
  });
