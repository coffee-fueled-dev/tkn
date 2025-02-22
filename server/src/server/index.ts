import net, { Socket, Server } from "net";
import { hello, sayHello } from "../lib/logs";
import { driver } from "../lib/clients";
import { StreamHandler } from "./stream-handler";

sayHello();

/**
 * Starts a TCP gateway server on the specified port.
 * The first message from a client must be an authentication token.
 * Once authenticated, subsequent data is forwarded to a dedicated StreamHandler.
 *
 * @param port - The port to listen on (default 5000)
 * @returns An object containing the server instance and a shutdown function.
 */
export function startServer(port: number = 5000): Server {
  // Set to track active client connections
  const activeConnections = new Set<Socket>();

  const server: Server = net.createServer((clientSocket: Socket) => {
    hello.gateway.info(
      `New client connected from ${clientSocket.remoteAddress}`
    );
    activeConnections.add(clientSocket);

    clientSocket.on("close", () => {
      activeConnections.delete(clientSocket);
      hello.gateway.info(`Client disconnected: ${clientSocket.remoteAddress}`);
    });

    // Validate connection using the first data received (authentication token)
    clientSocket.once("data", (data: Buffer) => {
      const token = data.toString().trim();
      hello.gateway.info(`Received token: ${token}`);

      // Replace this with your actual token validation logic.
      if (token !== "valid_token") {
        hello.gateway.warn(
          `Unauthorized connection attempt with token: ${token}`
        );
        clientSocket.write("AUTH FAIL\n");
        clientSocket.end();
        return;
      }

      // On successful authentication, assign a dedicated StreamHandler
      const handler = new StreamHandler(driver);

      // Now, process subsequent data without further ACL checks.
      clientSocket.on("data", (chunk: Buffer) => {
        const message = chunk.toString();
        hello.gateway.debug(`Processing data: ${message}`);

        handler.enqueueTask(chunk);
      });
    });

    clientSocket.on("error", (err: Error) => {
      hello.gateway.error(`Socket error: ${err.message}`);
    });
  });

  server.on("error", (err: Error) => {
    hello.gateway.error(`Server error: ${err.message}`);
  });

  server.listen(port, () => {
    hello.gateway.info(`Gateway server listening on port ${port}`);
  });

  // Graceful shutdown function
  function shutdown(): void {
    hello.gateway.warn("Initiating graceful shutdown of gateway server...");
    // Stop accepting new connections.
    server.close(() => {
      hello.gateway.info(
        "Gateway server has stopped accepting new connections."
      );
    });
    // Close all active connections gracefully.
    for (const socket of activeConnections) {
      socket.end("Server is shutting down...\n");
    }
    // Forcefully destroy any lingering connections after a delay.
    setTimeout(() => {
      for (const socket of activeConnections) {
        socket.destroy();
      }
      hello.gateway.info("All connections closed.");
    }, 5000);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
