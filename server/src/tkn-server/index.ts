import { hello, sayHello } from "../lib/logs";
import { Observer } from "./observer";
import { SyncStream } from "./sync-stream";
import { neo4jDriver } from "../lib/clients";
import { randomUUIDv7, type TCPSocketListener } from "bun";
import { metricsServer } from "./metrics-server";
import { env } from "../lib/env";
import { recordOperation } from "./throughput-monitor";
type SocketData = {
  sessionId: string;
  observer: Observer;
  syncStream: SyncStream;
};

export const TknServer = () => {
  sayHello();

  hello.server.info("Starting server");

  const server = Bun.listen<SocketData>({
    hostname: "localhost",
    port: env.TKN_PORT,
    socket: {
      data(socket, data) {
        const startTime = performance.now();
        socket.write(`${socket.data.sessionId}: ack`);
        socket.data.observer.transform(data, (err, token) => {
          if (err) {
            hello.server.error("Error transforming data:", err);
            recordOperation(
              "server",
              "socket-data-processing",
              performance.now() - startTime,
              true
            );
          } else if (token) {
            recordOperation(
              "server",
              "socket-data-processing",
              performance.now() - startTime,
              false,
              ["observer"]
            );
            socket.data.syncStream.process(token);
          }
        });
      },
      open(socket) {
        const startTime = performance.now();
        sayHello();
        hello.server.debug("New connection");
        const sessionId = randomUUIDv7();
        socket.data = {
          sessionId,
          observer: new Observer(),
          syncStream: new SyncStream(sessionId, neo4jDriver),
        };
        recordOperation(
          "server",
          "connection-opened",
          performance.now() - startTime,
          false
        );
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
