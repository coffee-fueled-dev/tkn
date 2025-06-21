import { variables } from "../environment";
import type { MessageBuffer } from "./message-buffer";
import { TknMiner } from "./miner";
import { randomUUIDv7, type Socket } from "bun";
import { createMessageBuffer } from "./message-buffer";
import { memgraphDriver, MemgraphManager } from "./memgraph";
import { parseMessage } from "./parse-message";
// import { baseline } from "./symbol-table/baseline";
import { LRUCache } from "lru-cache";

export type SocketData = {
  sessionId: string;
  tknMiner: TknMiner;
  tknBank: LRUCache<number, boolean>;
  memgraphManager: MemgraphManager;
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

const BATCH_SIZE = 1000;
const ITEM_SIZE_THRESHOLD = 1000;
const BANK_SIZE = 10000;

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
        const tknBank = new LRUCache<number, boolean>({
          max: BANK_SIZE,
        });
        const tknMiner = new TknMiner(tknBank);
        const memgraphManager = new MemgraphManager(sessionId, memgraphDriver);
        const messageBuffer = createMessageBuffer();

        socket.data = {
          sessionId,
          tknMiner,
          tknBank,
          memgraphManager,
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

        console.info(`🔗 Session ${sessionId} connected`);

        try {
          // await baseline.bpe.tinyStoriesEnglish(socket.data.tknBank);
          socket.write("READY");
        } catch (error) {
          console.error(
            `❌ Failed to preload symbol table for session ${sessionId}:`,
            error
          );

          socket.write("READY");
        }
      },
      async close(socket) {
        const { sessionId } = socket.data;

        // Drain any remaining items in the queue before closing
        if (socket.data.queue.length > 0 && !socket.data.draining) {
          console.log(
            `Draining remaining ${socket.data.queue.length} items for session ${sessionId}...`
          );
          socket.data.drain(socket.data.queue);
        }

        // Flush any remaining window content
        const finalFlush = socket.data.tknMiner.flush();
        if (finalFlush.data) {
          console.log(
            `Flushed final token for session ${sessionId}:`,
            finalFlush.data.value
          );
        }

        while (socket.data.draining || socket.data.queue.length > 0) {
          console.log(
            `Waiting for session ${sessionId} to finish processing queue (${socket.data.queue.length} items remaining)...`
          );
          await new Promise((resolve) => setTimeout(resolve, 100)); // Wait 100ms and check again
        }

        reportSessionPerformance(socket, sessionId);

        socket.data.tknBank.clear();
        socket.data.messageBuffer.clear();
        socket.data.tknMiner.clear();

        console.info(`🔌 Session ${sessionId} disconnected`);
      },
      error(err) {
        console.error("❌ Socket error:", err);
      },
    },
  });

const createDrain = (socket: Socket<SocketData>) => (queue: string[]) => {
  socket.data.draining = true;
  const drainStartTime = performance.now();
  socket.data.performance.drainCallCount++;

  // Time the batching operation
  const batchStartTime = performance.now();
  const inputBuffer = createBatch(socket, queue);
  const batchEndTime = performance.now();
  socket.data.performance.batchingTime += batchEndTime - batchStartTime;

  if (inputBuffer.length > 0) {
    // Time the tokenization operation
    const tokenizationStartTime = performance.now();
    const tokens = socket.data.tknMiner.processBuffer(inputBuffer);

    // If this is the final drain (queue is now empty), flush remaining content
    const flushResult =
      socket.data.queue.length === 0 ? socket.data.tknMiner.flush() : null;
    if (flushResult?.data) {
      tokens.push(flushResult);
    }

    const tokenizationEndTime = performance.now();
    socket.data.performance.tokenizationTime +=
      tokenizationEndTime - tokenizationStartTime;

    // Token processing (not timed as it's just iteration)
    for (const token of tokens) {
      if (token.data) {
        // console.log(token.data.sessionIndex, token.data.value, token.data.buffer);
        // socket.data.memgraphManager.enqueue(token.data);
      }
    }
  }

  const drainEndTime = performance.now();
  socket.data.performance.totalProcessingTime += drainEndTime - drainStartTime;
  socket.data.draining = false;
};

const createBatch = (socket: Socket<SocketData>, queue: string[]) => {
  // Batch all strings into one buffer conversion
  const batchedInput = queue.join("");
  // Single buffer conversion for the entire batch
  const inputBuffer = Buffer.from(batchedInput, "utf-8");
  queue.length = 0; // Clear the queue efficiently

  // Track bytes processed
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
  // Calculate and report performance metrics
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

    // Pure tokenization performance
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

    console.info(`📊 Performance Summary for Session ${sessionId}:`);
    console.info(
      `   Total bytes processed: ${totalBytes.toLocaleString()} bytes`
    );
    console.info(
      `   Total session duration: ${totalSessionDuration.toFixed(2)} ms`
    );
    console.info(
      `   Total processing time: ${totalProcessingTime.toFixed(2)} ms`
    );
    console.info(
      `   - Batching time: ${batchingTime.toFixed(
        2
      )} ms (${batchingOverhead.toFixed(1)}%)`
    );
    console.info(`   - Tokenization time: ${tokenizationTime.toFixed(2)} ms`);
    console.info(
      `   Processing efficiency: ${processingEfficiency.toFixed(
        1
      )}% (processing vs session time)`
    );
    console.info(`   Drain function calls: ${drainCallCount}`);
    console.info(
      `   Avg time per call: ${avgProcessingTimePerCall.toFixed(
        2
      )} ms (${avgBatchingTimePerCall.toFixed(
        2
      )}ms batch + ${avgTokenizationTimePerCall.toFixed(2)}ms tokenization)`
    );
    console.info(
      `   Overall processing rate: ${bytesPerMs.toFixed(
        2
      )} bytes/ms (${mbPerSecond.toFixed(2)} MB/sec)`
    );
    console.info(
      `   Pure tokenization rate: ${tokenizationBytesPerMs.toFixed(
        2
      )} bytes/ms (${tokenizationMbPerSecond.toFixed(2)} MB/sec)`
    );
  } else {
    console.info(
      `📊 Performance Summary for Session ${sessionId}: No processing time recorded`
    );
  }
};
