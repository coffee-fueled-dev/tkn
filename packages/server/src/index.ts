import { startHttpServer } from "./http-server";
import { startSocketServer } from "./socket-server";
import pino from "pino";

const logger = pino({ name: "server" });

const { shutdown } = (() => {
  const httpServer = startHttpServer();
  const socketServer = startSocketServer();

  logger.info(`TKN socket server listening on port ${socketServer.port}`);
  logger.info(`Health check: http://localhost:${httpServer.port}/health`);

  const shutdown = () => {
    logger.info("Shutting down TKN server...");
    httpServer.stop(true);
    socketServer.stop(true);
    console.info("Server shutdown complete");
  };

  return {
    shutdown,
  };
})();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
