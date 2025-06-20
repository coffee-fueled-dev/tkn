import type { Socket } from "bun";
import { environment } from "./environment";
import { metrics } from "./metrics";

// Define the performance data structure
export interface PerformanceData {
  type:
    | "session_start"
    | "session_end"
    | "data_ingested"
    | "batch_processed"
    | "transform_completed"
    | "db_operation";
  sessionId: string;
  timestamp: number;
  data: any;
}

interface SessionData {
  sessionId: string;
  startTime: number;
  itemsProcessed: number;
  tokensEmitted: number;
  batchesProcessed: number;
  totalBytes: number;
  transformsCount: number;
}

// Track active sessions
const activeSessions = new Map<string, SessionData>();

export function startSocketServer() {
  const server = Bun.listen<SessionData>({
    hostname: "0.0.0.0",
    port: environment.SOCKET_PORT,
    socket: {
      open(socket) {
        const clientInfo = `${socket.remoteAddress}:${
          socket.remotePort || "unknown"
        }`;
        console.log(`📡 ✅ Metrics client connected from ${clientInfo}`);
      },

      data(socket, data) {
        try {
          const message = new TextDecoder().decode(data);
          const performanceData: PerformanceData = JSON.parse(message);
          const clientInfo = `${socket.remoteAddress}:${
            socket.remotePort || "unknown"
          }`;
          console.log(
            `📡 📥 Received ${performanceData.type} event from ${clientInfo} for session ${performanceData.sessionId}`
          );
          handlePerformanceData(performanceData);
        } catch (error) {
          const clientInfo = `${socket.remoteAddress}:${
            socket.remotePort || "unknown"
          }`;
          console.error(
            `❌ Error parsing performance data from ${clientInfo}:`,
            error
          );
        }
      },

      close(socket) {
        const clientInfo = `${socket.remoteAddress}:${
          socket.remotePort || "unknown"
        }`;
        console.log(`📡 🔌 Metrics client disconnected from ${clientInfo}`);
      },

      error(socket, error) {
        const clientInfo = `${socket.remoteAddress}:${
          socket.remotePort || "unknown"
        }`;
        console.error(`❌ Socket error from ${clientInfo}:`, error);
      },
    },
  });

  return {
    stop: () => server.stop(),
    server,
  };
}

function handlePerformanceData(data: PerformanceData) {
  const { type, sessionId, timestamp, data: payload } = data;

  switch (type) {
    case "session_start":
      handleSessionStart(sessionId, timestamp, payload);
      break;

    case "session_end":
      handleSessionEnd(sessionId, timestamp, payload);
      break;

    case "data_ingested":
      handleDataIngested(sessionId, timestamp, payload);
      break;

    case "batch_processed":
      handleBatchProcessed(sessionId, timestamp, payload);
      break;

    case "transform_completed":
      handleTransformCompleted(sessionId, timestamp, payload);
      break;

    case "db_operation":
      handleDbOperation(sessionId, timestamp, payload);
      break;

    default:
      console.warn(`⚠️  Unknown performance data type: ${type}`);
  }
}

function handleSessionStart(
  sessionId: string,
  timestamp: number,
  payload: any
) {
  const sessionData: SessionData = {
    sessionId,
    startTime: timestamp,
    itemsProcessed: 0,
    tokensEmitted: 0,
    batchesProcessed: 0,
    totalBytes: 0,
    transformsCount: 0,
  };

  activeSessions.set(sessionId, sessionData);

  // Update metrics
  metrics.sessionsTotal.inc({ status: "active" });
  metrics.activeSessions.set(activeSessions.size);

  console.log(
    `🚀 Session started: ${sessionId} (preload: ${
      payload.preloadCompleted || false
    })`
  );
}

function handleSessionEnd(sessionId: string, timestamp: number, payload: any) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn(`⚠️  Session end event for unknown session: ${sessionId}`);
    return;
  }

  const duration = (timestamp - session.startTime) / 1000; // Convert to seconds

  // Update metrics with session totals
  metrics.sessionDuration.observe(duration);
  metrics.sessionsTotal.inc({ status: "completed" });
  metrics.activeSessions.set(activeSessions.size - 1);

  // Record final session stats from our tracked data
  metrics.itemsProcessed.inc(session.itemsProcessed);
  metrics.tokensEmitted.inc(session.tokensEmitted);

  // Calculate compression ratio
  if (session.itemsProcessed > 0 && session.tokensEmitted > 0) {
    const compressionRatio = session.itemsProcessed / session.tokensEmitted;
    metrics.compressionRatio.observe(compressionRatio);
  }

  // Calculate bytes per token
  if (session.totalBytes > 0 && session.tokensEmitted > 0) {
    const bytesPerToken = session.totalBytes / session.tokensEmitted;
    metrics.bytesPerToken.observe(bytesPerToken);
  }

  // Clean up
  activeSessions.delete(sessionId);

  console.log(
    `✅ Session completed: ${sessionId} (${duration.toFixed(2)}s, ${
      session.itemsProcessed
    } items, ${session.tokensEmitted} tokens, ${(
      session.itemsProcessed / Math.max(session.tokensEmitted, 1)
    ).toFixed(2)}:1 compression)`
  );
}

function handleDataIngested(
  sessionId: string,
  timestamp: number,
  payload: any
) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.totalBytes += payload.totalBytes || 0;
  } else {
    console.warn(`⚠️  Data ingested event for unknown session: ${sessionId}`);
  }

  // Update metrics
  if (payload.itemCount) {
    metrics.itemsProcessed.inc(payload.itemCount);
  }

  console.log(
    `📥 Data ingested [${sessionId}]: ${payload.itemCount} items, ${payload.totalBytes} bytes`
  );
}

function handleBatchProcessed(
  sessionId: string,
  timestamp: number,
  payload: any
) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.batchesProcessed++;
    session.itemsProcessed += payload.batchSize || 0;
  }

  // Update metrics
  if (payload.batchSize) {
    metrics.batchSize.observe(payload.batchSize);
  }
  if (payload.processingDuration) {
    metrics.batchProcessingDuration.observe(payload.processingDuration / 1000); // Convert to seconds
  }
  if (payload.queueLength !== undefined) {
    metrics.queueLength.set(payload.queueLength);
  }
}

function handleTransformCompleted(
  sessionId: string,
  timestamp: number,
  payload: any
) {
  const session = activeSessions.get(sessionId);
  if (session && payload.tokensEmitted) {
    session.tokensEmitted += payload.tokensEmitted;
  }

  // Update metrics
  if (payload.duration) {
    metrics.transformDuration.observe(payload.duration / 1000); // Convert to seconds
  }
  if (payload.tokensEmitted) {
    metrics.tokensEmitted.inc(payload.tokensEmitted);
  }
}

function handleDbOperation(sessionId: string, timestamp: number, payload: any) {
  // Update metrics
  if (payload.operation) {
    metrics.dbOperations.inc({ operation: payload.operation });
  }
  if (payload.duration) {
    metrics.dbOperationDuration.observe(payload.duration / 1000); // Convert to seconds
  }
}
