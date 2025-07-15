import pino from "pino";
import type { SocketData } from "..";
import type { Socket } from "bun";

const logger = pino({ name: "socket-server-report-session-performance" });

export const reportSessionPerformance = (
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
