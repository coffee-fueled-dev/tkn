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
      const tokens: Uint8Array[] = [];

      // Process each byte individually with the new API
      for (const byte of inputBuffer) {
        const token = socket.data.lzst.processByte(byte);
        if (token) {
          tokens.push(token);
        }
      }

      // Handle flush if queue is empty
      const flushResult =
        socket.data.queue.length === 0 ? socket.data.lzst.flush() : null;
      if (flushResult?.current) {
        tokens.push(flushResult.current);
      }

      const tokenizationEndTime = performance.now();
      socket.data.performance.tokenizationTime +=
        tokenizationEndTime - tokenizationStartTime;

      // Publish tokens to Redis for broker processing
      const tokensToPublish: Token[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        logger.debug(
          {
            sessionId: socket.data.sessionId,
            token: decoder.decode(token),
            sessionIndex: i,
          },
          "Processing token"
        );
        tokensToPublish.push({
          buffer: token,
          sessionIndex: i,
          sessionId: socket.data.sessionId,
          tenantId: socket.data.sessionId, // Using sessionId as tenantId for now
          timestamp: Date.now(),
        });
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
