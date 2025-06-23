import { variables } from "../environment";
import type { MessageBuffer } from "./message-buffer";
import { LZST } from "./lzst";
import { keyGenerators, type TokenCache } from "./key-generators";
import { randomUUIDv7, type Socket } from "bun";
import { createMessageBuffer } from "./message-buffer";
import { parseMessage } from "./parse-message";
import { preload } from "./preload";
import { LRUCache } from "lru-cache";
import { RedisPublisher, type Token } from "./redis-publisher";
import pino from "pino";

const logger = pino({ name: "socket-server" });

const {
  BATCH_SIZE,
  ITEM_SIZE_THRESHOLD,
  BANK_SIZE,
  KEY_GENERATOR,
  MAX_WINDOW_SIZE,
} = variables;

// Create a decoder instance for converting buffers to strings when needed
const decoder = new TextDecoder("utf-8", { fatal: false });

export type SocketData = {
  sessionId: string;
  lzst: LZST;
  tokenCache: TokenCache;
  redisPublisher: RedisPublisher;
  messageBuffer: MessageBuffer;
  queue: string[];
  draining: boolean;
  drain: (queue: string[]) => void;
  performance: {
    startTime: number;
    totalBytesProcessed: number;
    totalProcessingTime: number;
    drainCallCount: number;
    batchingTime: number;
    tokenizationTime: number;
  };
};

export const startSocketServer = () =>
  Bun.listen<SocketData>({
    hostname: "0.0.0.0",
    port: variables.TKN_PORT + 1,
    socket: {
      data(socket, data) {
        socket.data.messageBuffer.push(data);

        let message;
        while (
          (message = socket.data.messageBuffer.extractMessage()) !== null
        ) {
          const content = parseMessage(message.data);
          socket.data.queue.push(...content);

          const shouldDrain =
            !socket.data.draining &&
            (socket.data.queue.length >= BATCH_SIZE ||
              socket.data.queue.some(
                (item) => item.length > ITEM_SIZE_THRESHOLD
              ));

          if (shouldDrain) {
            socket.data.drain(socket.data.queue);
          }
        }
      },
      async open(socket) {
        const sessionId = randomUUIDv7();
        const tokenCache: TokenCache = new LRUCache({
          max: BANK_SIZE,
        });
        const lzst = new LZST(
          tokenCache,
          MAX_WINDOW_SIZE,
          keyGenerators[KEY_GENERATOR]
        );
        const redisPublisher = new RedisPublisher();
        const messageBuffer = createMessageBuffer();

        socket.data = {
          sessionId,
          lzst,
          tokenCache,
          redisPublisher,
          messageBuffer,
          drain: createDrain(socket),
          queue: [],
          draining: false,
          performance: {
            startTime: performance.now(),
            totalBytesProcessed: 0,
            totalProcessingTime: 0,
            drainCallCount: 0,
            batchingTime: 0,
            tokenizationTime: 0,
          },
        };

        logger.info({ sessionId }, "Session connected");

        try {
          // Ensure Redis connection is established before processing
          await socket.data.redisPublisher.getSubscriberCount();

          await preload.bpe.tinyStoriesEnglish(
            socket.data.tokenCache,
            keyGenerators[KEY_GENERATOR]
          );

          socket.write("READY");
        } catch (error) {
          logger.error(
            { sessionId, error },
            "Failed to preload cache for session"
          );

          socket.write("READY");
        }
      },
      async close(socket) {
        const { sessionId } = socket.data;

        if (socket.data.queue.length > 0 && !socket.data.draining) {
          logger.info(
            { sessionId, queueLength: socket.data.queue.length },
            "Draining remaining items for session"
          );
          socket.data.drain(socket.data.queue);
        }

        const finalFlush = socket.data.lzst.flush();
        if (finalFlush.data) {
          const tokenString = decoder.decode(finalFlush.data.buffer);
          logger.debug(
            { sessionId, token: tokenString },
            "Flushed final token for session"
          );
        }

        while (socket.data.draining || socket.data.queue.length > 0) {
          logger.debug(
            { sessionId, queueLength: socket.data.queue.length },
            "Waiting for session to finish processing queue"
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        reportSessionPerformance(socket, sessionId);

        socket.data.tokenCache.clear();
        socket.data.messageBuffer.clear();
        socket.data.lzst.clear();

        logger.info({ sessionId }, "Session disconnected");
      },
      error(err) {
        logger.error({ error: err }, "Socket error");
      },
    },
  });

const createDrain = (socket: Socket<SocketData>) => (queue: string[]) => {
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
        const tokenString = decoder.decode(token.data.buffer);
        logger.debug(
          {
            sessionId: socket.data.sessionId,
            token: tokenString,
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
  socket.data.performance.totalProcessingTime += drainEndTime - drainStartTime;
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

const reportSessionPerformance = (
  socket: Socket<SocketData>,
  sessionId: string
) => {
  const endTime = performance.now();
  const totalSessionDuration = endTime - socket.data.performance.startTime;
  const totalBytes = socket.data.performance.totalBytesProcessed;
  const totalProcessingTime = socket.data.performance.totalProcessingTime;
  const batchingTime = socket.data.performance.batchingTime;
  const tokenizationTime = socket.data.performance.tokenizationTime;
  const drainCallCount = socket.data.performance.drainCallCount;

  if (totalProcessingTime > 0) {
    const bytesPerMs = totalBytes / totalProcessingTime;
    const bytesPerSecond = bytesPerMs * 1000;
    const mbPerSecond = bytesPerSecond / (1024 * 1024);

    const tokenizationBytesPerMs =
      tokenizationTime > 0 ? totalBytes / tokenizationTime : 0;
    const tokenizationBytesPerSecond = tokenizationBytesPerMs * 1000;
    const tokenizationMbPerSecond = tokenizationBytesPerSecond / (1024 * 1024);

    const avgProcessingTimePerCall = totalProcessingTime / drainCallCount;
    const avgBatchingTimePerCall = batchingTime / drainCallCount;
    const avgTokenizationTimePerCall = tokenizationTime / drainCallCount;
    const processingEfficiency =
      (totalProcessingTime / totalSessionDuration) * 100;
    const batchingOverhead = (batchingTime / totalProcessingTime) * 100;

    logger.info({ sessionId }, "📊 Performance Summary for Session");
    logger.info(
      { sessionId, totalBytesProcessed: totalBytes.toLocaleString() },
      "   Total bytes processed"
    );
    logger.info(
      { sessionId, totalSessionDuration: totalSessionDuration.toFixed(2) },
      "   Total session duration"
    );
    logger.info(
      { sessionId, totalProcessingTime: totalProcessingTime.toFixed(2) },
      "   Total processing time"
    );
    logger.info(
      { sessionId, batchingTime: batchingTime.toFixed(2) },
      "   - Batching time"
    );
    logger.info(
      { sessionId, batchingOverhead: batchingOverhead.toFixed(1) },
      "   - Batching overhead"
    );
    logger.info(
      { sessionId, tokenizationTime: tokenizationTime.toFixed(2) },
      "   - Tokenization time"
    );
    logger.info(
      { sessionId, processingEfficiency: processingEfficiency.toFixed(1) },
      "   Processing efficiency"
    );
    logger.info({ sessionId, drainCallCount }, "   Drain function calls");
    logger.info(
      {
        sessionId,
        avgProcessingTimePerCall: avgProcessingTimePerCall.toFixed(2),
      },
      "   Avg time per call"
    );
    logger.info(
      { sessionId, avgBatchingTimePerCall: avgBatchingTimePerCall.toFixed(2) },
      "   Avg batching time per call"
    );
    logger.info(
      {
        sessionId,
        avgTokenizationTimePerCall: avgTokenizationTimePerCall.toFixed(2),
      },
      "   Avg tokenization time per call"
    );
    logger.info(
      { sessionId, overallProcessingRate: bytesPerMs.toFixed(2) },
      "   Overall processing rate"
    );
    logger.info(
      { sessionId, mbPerSecond: mbPerSecond.toFixed(2) },
      "   Overall processing rate"
    );
    logger.info(
      { sessionId, pureTokenizationRate: tokenizationBytesPerMs.toFixed(2) },
      "   Pure tokenization rate"
    );
    logger.info(
      {
        sessionId,
        tokenizationMbPerSecond: tokenizationMbPerSecond.toFixed(2),
      },
      "   Pure tokenization rate"
    );
  } else {
    logger.info(
      { sessionId },
      "📊 Performance Summary for Session No processing time recorded"
    );
  }
};
