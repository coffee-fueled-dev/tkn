import { startHttpServer } from "./http-server";
import { startSocketServer } from "./socket-server";
import { memgraphDriver } from "./socket-server/memgraph";

const { shutdown } = (() => {
  const httpServer = startHttpServer();
  const socketServer = startSocketServer();

  console.info(`TKN socket server listening on port ${socketServer.port}`);
  console.info(`Health check: http://localhost:${httpServer.port}/health`);

  const shutdown = () => {
    console.info("Shutting down TKN server...");
    httpServer.stop(true);
    socketServer.stop(true);
    memgraphDriver.close();
    console.info("Server shutdown complete");
  };

  return {
    shutdown,
  };
})();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
