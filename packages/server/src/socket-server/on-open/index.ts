import { LZST } from "../lzst";
import { randomUUIDv7, type Socket } from "bun";
import { createMessageBuffer } from "../message-buffer";
import { RedisPublisher } from "../redis-publisher";
import pino from "pino";
import { TokenCache } from "../token-cache";
import type { SocketData } from "..";
import { createDrain } from "./create-drain";
import { initializeSession } from "../on-data/initialize-session";

const logger = pino({ name: "socket-server-on-open" });

export async function onOpen(socket: Socket<SocketData>) {
  const sessionId = randomUUIDv7();
  const redisPublisher = new RedisPublisher();
  const messageBuffer = createMessageBuffer();

  socket.data = {
    sessionId,
    lzst: null as unknown as LZST, // Will be initialized after configuration
    tokenCache: null as unknown as TokenCache,
    redisPublisher,
    messageBuffer,
    drain: createDrain(socket),
    queue: [],
    draining: false,
    configured: false,
    keyGeneratorName: "fastHash",
    performance: {
      startTime: performance.now(),
      totalBytesProcessed: 0,
      totalProcessingTime: 0,
      drainCallCount: 0,
      batchingTime: 0,
      tokenizationTime: 0,
    },
  };

  logger.info({ sessionId }, "Session connected, waiting for configuration");

  // Send configuration prompt to client
  socket.write("CONFIG_REQUIRED");

  // Set a timeout to auto-configure with defaults if no config received
  setTimeout(async () => {
    if (!socket.data.configured) {
      logger.info({ sessionId }, "No configuration received, using defaults");
      await initializeSession(socket);
    }
  }, 5000); // 5 second timeout
}
