import { variables } from "../environment";
import type { MessageBuffer } from "./message-buffer";
import { TknMiner } from "./miner";
import { SymbolTable } from "./symbol-table";
import { processBatch } from "./process-batch";
import { randomUUIDv7 } from "bun";
import { createMessageBuffer } from "./message-buffer";
import { PROTOCOL_HEADER_SIZE } from "./process-batch";
import { memgraphDriver, MemgraphManager } from "./memgraph";
import { ProcessMonitor, monitorRegistry } from "./monitor";

export type SocketData = {
  sessionId: string;
  tknMiner: TknMiner;
  memgraphManager: MemgraphManager;
  symbolTable: SymbolTable;
  messageBuffer: MessageBuffer;
  monitor: ProcessMonitor;
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

        // Register monitor for aggregated metrics
        monitorRegistry.register(sessionId, monitor);

        socket.data = {
          sessionId,
          tknMiner,
          memgraphManager,
          symbolTable,
          messageBuffer,
          monitor,
        };

        console.info(`🔗 Session ${sessionId.slice(0, 8)} connected`);
      },
      async close(socket) {
        const { sessionId, monitor } = socket.data;

        // Capture session metrics before cleanup
        const sessionMetrics = monitor.getMetrics();
        if (sessionMetrics.transform.count > 0) {
          console.info(`📋 Session ${sessionId.slice(0, 8)} completed:`, {
            transforms: sessionMetrics.transform.count,
            memgraphOps: sessionMetrics.memgraph.count,
            avgTransformDuration:
              Math.round(sessionMetrics.transform.meanDuration * 100) / 100,
            avgMemgraphDuration:
              Math.round(sessionMetrics.memgraph.meanDuration * 100) / 100,
            mergeRate: Math.round(sessionMetrics.mergeRate.ratio * 10000) / 100, // as percentage
            inputItems: sessionMetrics.mergeRate.inputCount,
            tokensEmitted: sessionMetrics.mergeRate.mergeCount,
          });
        }

        // Unregister monitor before cleanup
        monitorRegistry.unregister(sessionId);

        socket.data.symbolTable.clear();
        socket.data.messageBuffer.clear();
        socket.data.monitor.reset();

        console.info(`🔌 Session ${sessionId.slice(0, 8)} disconnected`);
      },
      error(err) {
        console.error("❌ Socket error:", err);
      },
    },
  });

// Log metrics every 10 seconds
setInterval(() => {
  const aggregatedMetrics = monitorRegistry.getAggregatedMetrics();

  if (aggregatedMetrics.activeConnections > 0) {
    console.log(
      `📊 Overall metrics (${aggregatedMetrics.activeConnections} active connections):`
    );
    console.log(
      `  Transform avg: ${aggregatedMetrics.avgTransformDuration.toFixed(2)}ms`
    );
    console.log(
      `  Memgraph avg: ${aggregatedMetrics.avgMemgraphDuration.toFixed(2)}ms`
    );
    console.log(
      `  Merge rate: ${(aggregatedMetrics.overallMergeRate * 100).toFixed(2)}%`
    );

    // Check for bottlenecks across all connections
    if (aggregatedMetrics.bottlenecks.length > 0) {
      console.log(
        `⚠️  Bottlenecks detected: ${aggregatedMetrics.bottlenecks.join(", ")}`
      );
    }
  }
}, 10000);
