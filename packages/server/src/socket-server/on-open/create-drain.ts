import type { Socket } from "bun";
import type { SocketData } from "..";
import type { Token } from "../redis-publisher";
import pino from "pino";

const decoder = new TextDecoder("utf-8", { fatal: false });

const logger = pino({ name: "socket-server-create-drain" });

export const createDrain =
  (socket: Socket<SocketData>) => (queue: string[]) => {
    socket.data.draining = true;
    const drainStartTime = performance.now();
    socket.data.performance.drainCallCount++;

    const batchStartTime = performance.now();
    const inputBuffer = createBatch(socket, queue);
    const batchEndTime = performance.now();
    socket.data.performance.batchingTime += batchEndTime - batchStartTime;

    if (inputBuffer.length > 0) {
      const tokenizationStartTime = performance.now();
      const tokens = socket.data.lzst.processBuffer(inputBuffer);

      const flushResult =
        socket.data.queue.length === 0 ? socket.data.lzst.flush() : null;
      if (flushResult?.data) {
        tokens.push(flushResult);
      }

      const tokenizationEndTime = performance.now();
      socket.data.performance.tokenizationTime +=
        tokenizationEndTime - tokenizationStartTime;

      // Publish tokens to Redis for broker processing
      const tokensToPublish: Token[] = [];
      for (const token of tokens) {
        if (token.data) {
          logger.debug(
            {
              sessionId: socket.data.sessionId,
              token: decoder.decode(token.data.buffer),
              sessionIndex: token.data.sessionIndex,
            },
            "Processing token"
          );
          tokensToPublish.push({
            buffer: token.data.buffer,
            sessionIndex: token.data.sessionIndex,
            sessionId: socket.data.sessionId,
            tenantId: socket.data.sessionId, // Using sessionId as tenantId for now
            timestamp: Date.now(),
          });
        }
      }

      if (tokensToPublish.length > 0) {
        // Fire and forget - don't block on Redis publishing
        socket.data.redisPublisher
          .publishBatch(tokensToPublish)
          .then(() => {
            logger.info(
              {
                sessionId: socket.data.sessionId,
                tokensLength: tokensToPublish.length,
              },
              "Published tokens for session"
            );
          })
          .catch((error) => {
            logger.error(
              { sessionId: socket.data.sessionId, error },
              "Failed to publish tokens for session"
            );
          });
      }
    }

    const drainEndTime = performance.now();
    socket.data.performance.totalProcessingTime +=
      drainEndTime - drainStartTime;
    socket.data.draining = false;
  };

const createBatch = (socket: Socket<SocketData>, queue: string[]) => {
  const batchedInput = queue.join("");
  const inputBuffer = Buffer.from(batchedInput, "utf-8");
  queue.length = 0;

  socket.data.performance.totalBytesProcessed += Buffer.byteLength(
    batchedInput,
    "utf8"
  );

  return inputBuffer;
};
