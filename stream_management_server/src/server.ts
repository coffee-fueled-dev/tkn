import mqtt, { MqttClient } from "mqtt";
import { randomUUID } from "crypto";
import { env } from "./lib/env";
import { hello, sayHello } from "./lib/logs";

const { MQTT_BROKER_URI, MQTT_BROKER_PASS, MQTT_BROKER_USER, PORT } = env;
sayHello();

hello.server.info("Starting MQTT listener server...");

// In-memory storage for active listeners
const listeners: Map<string, MqttClient> = new Map();

export const startServer = () => {
  hello.server.info("Starting HTTP server...");

  // Start the HTTP server using Bun.serve
  const server = Bun.serve({
    port: PORT,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const method = request.method;

      hello.server.debug(`Incoming request: ${method} ${pathname}`);

      // Endpoint to create a new listener node
      if (pathname === "/create-listener" && method === "POST") {
        const listenerId: string = randomUUID();
        const topic: string = `listeners/${listenerId}`;
        const client: MqttClient = mqtt.connect(MQTT_BROKER_URI, {
          username: MQTT_BROKER_USER,
          password: MQTT_BROKER_PASS,
          reconnectPeriod: 1000, // Try reconnecting every second
          connectTimeout: 5000, // Timeout after 5 seconds
        });

        hello.server.info(
          `Creating new listener: ${listenerId}, Topic: ${topic}`
        );

        try {
          // Wait for the MQTT client to connect and subscribe to the topic
          await new Promise<void>((resolve, reject) => {
            client.on("connect", () => {
              hello.server.info(
                `MQTT client connected for Listener ${listenerId}`
              );
              client.subscribe(topic, (err: Error | null) => {
                if (err) {
                  hello.server.error(
                    `Failed to subscribe to ${topic}: ${err.message}`
                  );
                  reject(err);
                } else {
                  listeners.set(listenerId, client);
                  hello.server.info(
                    `Listener ${listenerId} subscribed to ${topic}`
                  );
                  resolve();
                }
              });
            });

            client.on("error", (error) => {
              hello.server.error(`MQTT connection error: ${error.message}`);
              reject(error);
            });

            client.on("message", (receivedTopic, message) => {
              hello.server.debug(
                `Message received on ${receivedTopic}: ${message.toString()}`
              );
            });
          });

          // Return the listener details so IoT devices know where to publish data
          return new Response(JSON.stringify({ listenerId, topic }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          if (error instanceof Error) {
            hello.server.error(`Error in /create-listener: ${error.message}`);
            return new Response(
              JSON.stringify({ error: error.message || "Unknown error" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Endpoint to close an existing listener node
      if (pathname.startsWith("/close-listener/") && method === "DELETE") {
        const parts: string[] = pathname.split("/");
        const listenerId: string = parts[2];
        const client: MqttClient | undefined = listeners.get(listenerId);

        if (!client) {
          hello.server.warn(
            `Attempted to close non-existent listener: ${listenerId}`
          );
          return new Response(JSON.stringify({ error: "Listener not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const topic: string = `listeners/${listenerId}`;
        hello.server.info(`Closing listener ${listenerId} on topic ${topic}`);

        try {
          await new Promise<void>((resolve, reject) => {
            client.unsubscribe(topic, (err) => {
              if (err) {
                hello.server.error(
                  `Failed to unsubscribe listener ${listenerId} from ${topic}: ${err.message}`
                );
                reject(err);
              } else {
                client.end(); // Disconnect the client
                listeners.delete(listenerId);
                hello.server.info(`Listener ${listenerId} on ${topic} closed.`);
                resolve();
              }
            });
          });

          return new Response(JSON.stringify({ message: "Listener closed" }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          if (error instanceof Error) {
            hello.server.error(`Error in /close-listener: ${error.message}`);
            return new Response(
              JSON.stringify({ error: error.message || "Unknown error" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Fallback for routes not handled
      hello.server.warn(`Unhandled route: ${method} ${pathname}`);
      return new Response("Not Found", { status: 404 });
    },
  });

  hello.server.info(`HTTP server is running on port ${PORT}`);

  // Graceful shutdown handler
  const gracefulShutdown = () => {
    hello.server.warn("Graceful shutdown initiated...");
    server.stop();

    // Close all active MQTT connections
    for (const [listenerId, client] of listeners.entries()) {
      client.end();
      hello.server.info(`Disconnected listener ${listenerId}`);
    }

    setTimeout(() => {
      hello.server.info("Shutdown complete. Exiting.");
      process.exit(0);
    }, 1000);
  };

  // Listen for termination signals
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  return server;
};
