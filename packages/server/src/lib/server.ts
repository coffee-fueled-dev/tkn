import { hello } from "../metrics/logs";
import { TknMiner } from "./miner";
import { SymbolTable } from "./symbol-table";
import { memgraphDriver } from "../memgraph/client";
import { randomUUIDv7 } from "bun";
import {
  recordOperation,
  incrementConnections,
  decrementConnections,
  createMetricsHandler,
} from "../metrics";
import { variables } from "../util/environment";
import { SyncStream } from "../memgraph/sync-stream";
import { handleData, type SocketData } from "./protocol";

export const TknServer = () => {
  hello.server.info("Starting TKN server with integrated metrics");

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

        hello.server.info("New connection");
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
        recordOperation(
          "server",
          "connection-opened",
          performance.now() - startTime,
          false
        );
      },
      close(socket) {
        hello.server.info("Connection closed");
        decrementConnections();
      },
      error(socket, err) {
        hello.server.error(
          "Socket error:",
          { sessionId: socket.data?.sessionId || "unknown" },
          err instanceof Error ? err : new Error(String(err))
        );
      },
    },
  });

  hello.server.info(`HTTP/Metrics server listening on port ${httpServer.port}`);
  hello.server.info(`TKN socket server listening on port ${socketServer.port}`);
  hello.server.info(`Health check: http://localhost:${httpServer.port}/health`);
  hello.server.info(`Metrics: http://localhost:${httpServer.port}/metrics`);

  const shutdown = () => {
    hello.server.info("Shutting down TKN server...");
    httpServer.stop(true);
    socketServer.stop(true);
    memgraphDriver.close();
    hello.server.info("Server shutdown complete");
  };

  return {
    httpServer,
    socketServer,
    shutdown,
  };
};
