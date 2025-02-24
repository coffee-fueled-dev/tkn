import net, { Socket, Server } from "net";
import { hello, sayHello } from "../lib/logs";
import { Observer } from "./observer";
import { Pusher } from "./pusher";
import { neo4jDriver } from "../lib/clients";

export class TknServer {
  private activeConnections = new Set<Socket>();
  private server: Server;

  constructor(private port: number = 5000) {
    sayHello();
    this.server = net.createServer(this.handleClient.bind(this));
    this.setupErrorHandlers();
    this.server.listen(this.port, () => {
      hello.server.info(`Server listening on port ${this.port}`);
    });
    process.on("SIGINT", this.shutdown.bind(this));
    process.on("SIGTERM", this.shutdown.bind(this));
  }

  private handleClient(clientSocket: Socket): void {
    hello.server.info(
      `New client connected from ${clientSocket.remoteAddress}`
    );
    this.activeConnections.add(clientSocket);

    clientSocket.on("close", () => {
      this.activeConnections.delete(clientSocket);
      hello.server.info(`Client disconnected: ${clientSocket.remoteAddress}`);
    });

    // Prompt the client for a key immediately upon connection.
    clientSocket.write("Enter key: ");

    // Wait for the client's response (the key)
    clientSocket.once("data", (data: Buffer) => {
      const key = data.toString().trim();
      hello.server.info(`Received key: ${key}`);

      // Replace this with your actual key validation logic.
      if (key !== "valid_key") {
        hello.server.warn(`Unauthorized connection attempt with key: ${key}`);
        clientSocket.write("AUTH FAIL\n");
        clientSocket.end();
        return;
      }

      // Confirm the key was validated.
      clientSocket.write("Key validated\n");

      // Proceed with setting up the data pipeline.
      const observer = new Observer();
      const pusher = new Pusher(key, neo4jDriver);
      clientSocket.pipe(observer);
      observer.pipe(pusher);
    });

    clientSocket.on("error", (err: Error) => {
      hello.server.error("Socket error: ", err);
    });
  }

  private setupErrorHandlers(): void {
    this.server.on("error", (err: Error) => {
      hello.server.error("Server error: ", err);
    });
  }

  public shutdown(): void {
    hello.server.warn("Initiating graceful shutdown of Server...");
    this.server.close(() => {
      hello.server.info("Server has stopped accepting new connections.");
    });
    neo4jDriver.close();

    for (const socket of this.activeConnections) {
      socket.end("Server is shutting down...\n");
    }
    setTimeout(() => {
      for (const socket of this.activeConnections) {
        socket.destroy();
      }
      hello.server.info("All connections closed.");
    }, 5000);
  }
}
