import mqtt, { MqttClient } from "mqtt";
import { randomUUID } from "crypto";
import { env } from "./lib/env";

const { MQTT_BROKER_URI } = env;

// In-memory storage for active listeners
const listeners: Map<string, MqttClient> = new Map();

export const startServer = () => {
  // Start the HTTP server using Bun.serve
  const server = Bun.serve({
    port: 4000,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const method = request.method;

      // Endpoint to create a new listener node
      if (pathname === "/create-listener" && method === "POST") {
        const listenerId: string = randomUUID();
        const topic: string = `listeners/${listenerId}`;
        const client: MqttClient = mqtt.connect(MQTT_BROKER_URI);

        try {
          // Wait for the MQTT client to connect and subscribe to the topic
          await new Promise<void>((resolve, reject) => {
            client.on("connect", () => {
              client.subscribe(topic, (err: Error | null) => {
                if (err) {
                  reject(err);
                } else {
                  listeners.set(listenerId, client);
                  console.log(`Listener ${listenerId} subscribed to ${topic}`);
                  resolve();
                }
              });
            });
            client.on("error", reject);
          });

          // Return the listener details so IoT devices know where to publish data
          return new Response(JSON.stringify({ listenerId, topic }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          if (error instanceof Error) {
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
          return new Response(JSON.stringify({ error: "Listener not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        const topic: string = `listeners/${listenerId}`;
        try {
          await new Promise<void>((resolve, reject) => {
            client.unsubscribe(topic, (err) => {
              if (err) {
                reject(err);
              } else {
                client.end(); // Disconnect the client
                listeners.delete(listenerId);
                console.log(`Listener ${listenerId} on ${topic} closed.`);
                resolve();
              }
            });
          });

          return new Response(JSON.stringify({ message: "Listener closed" }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          if (error instanceof Error) {
            return new Response(
              JSON.stringify({ error: error.message || "Unknown error" }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Fallback for routes not handled
      return new Response("Not Found", { status: 404 });
    },
  });

  // Graceful shutdown handler
  const gracefulShutdown = () => {
    console.log("Graceful shutdown initiated...");
    // Stop the Bun server from accepting new requests
    server.stop();

    // Close all active MQTT connections
    for (const [listenerId, client] of listeners.entries()) {
      client.end();
      console.log(`Disconnected listener ${listenerId}`);
    }

    // Give a short delay to allow connections to close cleanly
    setTimeout(() => {
      console.log("Shutdown complete. Exiting.");
      process.exit(0);
    }, 1000);
  };

  // Listen for termination signals
  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);

  return server;
};
