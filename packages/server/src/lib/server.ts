import { TknMiner } from "./miner";
import { SymbolTable } from "./symbol-table";
import { memgraphDriver } from "../memgraph/client";
import { randomUUIDv7 } from "bun";
import {
  incrementConnections,
  decrementConnections,
  createMetricsHandler,
} from "../metrics";
import { variables } from "../util/environment";
import { SyncStream } from "../memgraph/sync-stream";
import { handleData, type SocketData } from "./protocol";

export const TknServer = () => {
  // Create metrics handler
  const metricsHandler = createMetricsHandler();

  // HTTP server for metrics and health checks
  const httpServer = Bun.serve({
    port: variables.TKN_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/metrics") {
        return await metricsHandler(req);
      }

      if (url.pathname === "/health") {
        return new Response("OK", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }

      return new Response(
        "TKN Server - Use socket connection for data processing",
        {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }
      );
    },
  });

  const socketServer = Bun.listen<SocketData>({
    hostname: "0.0.0.0",
    port: variables.TKN_PORT + 1,
    socket: {
      data(socket, data) {
        handleData(socket, data);
      },
      open(socket) {
        const startTime = performance.now();

        const sessionId = randomUUIDv7();
        const symbolTable = new SymbolTable();
        socket.data = {
          sessionId,
          tknMiner: new TknMiner(),
          syncStream: new SyncStream(sessionId, memgraphDriver, symbolTable),
          symbolTable,
          buffer: new Uint8Array(8192), // Initial 8K buffer
          bufferSize: 0,
        };

        // Track connection metrics
        incrementConnections();
      },
      async close(socket) {
        console.info("Connection closed");

        // Flush any remaining tokens in the sync stream before closing
        if (socket.data?.syncStream) {
          const bufferLength = socket.data.syncStream.getBufferLength();
          if (bufferLength > 0) {
            console.info(
              `Flushing ${bufferLength} remaining tokens before connection close`
            );
            try {
              await socket.data.syncStream.flush();
            } catch (err) {
              console.error(
                "Error flushing sync stream on connection close:",
                err
              );
            }
          }
        }

        decrementConnections();
      },
      error(err) {
        console.error(err);
      },
    },
  });

  console.info(`HTTP/Metrics server listening on port ${httpServer.port}`);
  console.info(`TKN socket server listening on port ${socketServer.port}`);
  console.info(`Health check: http://localhost:${httpServer.port}/health`);
  console.info(`Metrics: http://localhost:${httpServer.port}/metrics`);

  const shutdown = () => {
    console.info("Shutting down TKN server...");
    httpServer.stop(true);
    socketServer.stop(true);
    memgraphDriver.close();
    console.info("Server shutdown complete");
  };

  return {
    httpServer,
    socketServer,
    shutdown,
  };
};
