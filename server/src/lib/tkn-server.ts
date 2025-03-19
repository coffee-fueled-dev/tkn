import { hello } from "./logs";
import { TknMiner } from "./tkn-miner";
import { SymbolTable } from "./symbol-table/symbol-table";
import { neo4jDriver } from "./neo4j";
import { randomUUIDv7 } from "bun";
import { metricsServer, recordOperation } from "./metrics-server";
import { env } from "./env";
import { SyncStream } from "./sync-stream";
import { handleData, type SocketData } from "./protocol-handler";

export const TknServer = () => {
  hello.server.info("Starting server");

  const server = Bun.listen<SocketData>({
    hostname: "localhost",
    port: env.TKN_PORT,
    socket: {
      data(socket, data) {
        // Use the protocol handler to process incoming data
        handleData(socket, data);
      },
      open(socket) {
        const startTime = performance.now();

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
        hello.server.error("Error:", err);
      },
    },
  });
  hello.server.info(`Server listening at ${server.hostname}:${server.port}`);

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
