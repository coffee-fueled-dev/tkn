import client from "prom-client";
import { environment } from "./environment";

// Create a Registry to register the metrics
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register,
  prefix: environment.PROMETHEUS_PREFIX,
});

// TKN-specific metrics
export const metrics = {
  // Session metrics
  sessionsTotal: new client.Counter({
    name: `${environment.PROMETHEUS_PREFIX}sessions_total`,
    help: "Total number of TKN sessions processed",
    labelNames: ["status"], // 'completed', 'failed', 'active'
  }),

  sessionDuration: new client.Histogram({
    name: `${environment.PROMETHEUS_PREFIX}session_duration_seconds`,
    help: "Duration of TKN sessions",
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300], // seconds
  }),

  // Processing metrics
  itemsProcessed: new client.Counter({
    name: `${environment.PROMETHEUS_PREFIX}items_processed_total`,
    help: "Total number of items processed",
  }),

  tokensEmitted: new client.Counter({
    name: `${environment.PROMETHEUS_PREFIX}tokens_emitted_total`,
    help: "Total number of tokens emitted",
  }),

  transformDuration: new client.Histogram({
    name: `${environment.PROMETHEUS_PREFIX}transform_duration_seconds`,
    help: "Time spent in transform operations",
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0], // seconds
  }),

  // Batch metrics
  batchSize: new client.Histogram({
    name: `${environment.PROMETHEUS_PREFIX}batch_size`,
    help: "Size of processing batches",
    buckets: [1, 5, 10, 25, 50, 100, 200, 500],
  }),

  batchProcessingDuration: new client.Histogram({
    name: `${environment.PROMETHEUS_PREFIX}batch_processing_duration_seconds`,
    help: "Time to process a batch",
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0],
  }),

  // Compression metrics
  compressionRatio: new client.Histogram({
    name: `${environment.PROMETHEUS_PREFIX}compression_ratio`,
    help: "Compression ratio achieved (tokens/items)",
    buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  }),

  bytesPerToken: new client.Histogram({
    name: `${environment.PROMETHEUS_PREFIX}bytes_per_token`,
    help: "Average bytes per token",
    buckets: [1, 5, 10, 20, 50, 100, 200, 500],
  }),

  // Database metrics
  dbOperations: new client.Counter({
    name: `${environment.PROMETHEUS_PREFIX}db_operations_total`,
    help: "Total database operations",
    labelNames: ["operation"], // 'insert', 'update', 'query'
  }),

  dbOperationDuration: new client.Histogram({
    name: `${environment.PROMETHEUS_PREFIX}db_operation_duration_seconds`,
    help: "Database operation duration",
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0],
  }),

  // Current state gauges
  activeSessions: new client.Gauge({
    name: `${environment.PROMETHEUS_PREFIX}active_sessions`,
    help: "Number of currently active sessions",
  }),

  queueLength: new client.Gauge({
    name: `${environment.PROMETHEUS_PREFIX}queue_length`,
    help: "Current processing queue length",
  }),
};

// Register all metrics
Object.values(metrics).forEach((metric) => {
  register.registerMetric(metric);
});

// Export the register for HTTP endpoint
export { register as prometheusRegister };
