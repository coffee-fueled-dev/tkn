import net, { Socket, Server } from "net";
import { hello, sayHello } from "../lib/logs";
import { Observer } from "./observer";
import { Pusher } from "./pusher";
import { neo4jDriver } from "../lib/clients";

/**
 * Starts a TCP Server on the specified port.
 * The first message from a client must be an authentication token.
 * Once authenticated, subsequent data is forwarded to a dedicated StreamHandler.
 *
 * @param port - The port to listen on (default 5000)
 * @returns An object containing the server instance and a shutdown function.
 */
export function startServer(port: number = 5000): Server {
  sayHello();
  // Set to track active client connections
  const activeConnections = new Set<Socket>();

  const server: Server = net.createServer((clientSocket: Socket) => {
    hello.server.info(
      `New client connected from ${clientSocket.remoteAddress}`
    );
    activeConnections.add(clientSocket);

    clientSocket.on("close", () => {
      activeConnections.delete(clientSocket);
      hello.server.info(`Client disconnected: ${clientSocket.remoteAddress}`);
    });

    // Validate connection using the first data received (authentication token)
    clientSocket.once("data", (data: Buffer) => {
      const token = data.toString().trim();
      hello.server.info(`Received token: ${token}`);

      // Replace this with your actual token validation logic.
      if (token !== "valid_token") {
        hello.server.warn(
          `Unauthorized connection attempt with token: ${token}`
        );
        clientSocket.write("AUTH FAIL\n");
        clientSocket.end();
        return;
      }

      // On successful authentication, assign a dedicated Observer and Pusher
      const observer = new Observer();
      const pusher = new Pusher(token, neo4jDriver);

      clientSocket.pipe(observer);
      observer.pipe(pusher);
    });

    clientSocket.on("error", (err: Error) => {
      hello.server.error("Socket error: ", err);
    });
  });

  server.on("error", (err: Error) => {
    hello.server.error("Server error: ", err);
  });

  server.listen(port, () => {
    hello.server.info(`Server listening on port ${port}`);
  });

  // Graceful shutdown function
  function shutdown(): void {
    hello.server.warn("Initiating graceful shutdown of Server...");
    // Stop accepting new connections.
    server.close(() => {
      hello.server.info("Server has stopped accepting new connections.");
    });

    // Close the neo4j driver
    neo4jDriver.close();

    // Close all active connections gracefully.
    for (const socket of activeConnections) {
      socket.end("Server is shutting down...\n");
    }
    // Forcefully destroy any lingering connections after a delay.
    setTimeout(() => {
      for (const socket of activeConnections) {
        socket.destroy();
      }
      hello.server.info("All connections closed.");
    }, 5000);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return server;
}
