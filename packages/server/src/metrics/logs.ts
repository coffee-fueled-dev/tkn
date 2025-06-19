import debug from "debug";
import { variables } from "../util/environment";
import * as promClient from "prom-client";

// Define log levels and namespaces
const namespaces = [
  "graph",
  "tknMiner",
  "syncStream",
  "server",
  "throughput",
] as const;
const logLevels = ["info", "warn", "debug", "error"] as const;

type Namespace = (typeof namespaces)[number];
type LogLevel = (typeof logLevels)[number];

// Prometheus metrics for logging
const logCounter = new promClient.Counter({
  name: "log_messages_total",
  help: "Total number of log messages by namespace and level",
  labelNames: ["namespace", "level"],
});

const errorLogCounter = new promClient.Counter({
  name: "log_errors_total",
  help: "Total number of error logs by namespace",
  labelNames: ["namespace", "error_type"],
});

const logRateGauge = new promClient.Gauge({
  name: "log_rate_per_second",
  help: "Rate of log messages per second by namespace",
  labelNames: ["namespace", "level"],
});

// Rate tracking for log metrics
const logRateTracker = new Map<string, { count: number; lastReset: number }>();

/**
 * Create debug patterns for different environments
 */
function createDebugPatterns(
  ns: readonly string[],
  levels: readonly string[]
): string {
  const patterns: string[] = [];

  for (const namespace of ns) {
    for (const level of levels) {
      patterns.push(`${namespace}:${level}`);
    }
  }

  return patterns.join(",");
}

/**
 * Update log rate metrics
 */
function updateLogRate(namespace: string, level: string): void {
  const key = `${namespace}:${level}`;
  const now = Date.now();
  const tracker = logRateTracker.get(key) || { count: 0, lastReset: now };

  tracker.count++;

  // Reset counter every second and update gauge
  if (now - tracker.lastReset >= 1000) {
    logRateGauge.labels(namespace, level).set(tracker.count);
    tracker.count = 0;
    tracker.lastReset = now;
  }

  logRateTracker.set(key, tracker);
}

/**
 * Record log metrics to Prometheus
 */
function recordLogMetrics(
  namespace: string,
  level: string,
  message?: string,
  error?: Error
): void {
  // Count all log messages
  logCounter.labels(namespace, level).inc();

  // Update rate tracking
  updateLogRate(namespace, level);

  // Track specific error types
  if (level === "error" && error) {
    const errorType = error.constructor.name || "UnknownError";
    errorLogCounter.labels(namespace, errorType).inc();
  }
}

/**
 * Create logger interface for a specific namespace and level
 */
function createLogger(namespace: string, level: string) {
  const debugLogger = debug(`${namespace}:${level}`);

  return (message: string, meta?: Record<string, any>, error?: Error) => {
    // Record metrics first
    recordLogMetrics(namespace, level, message, error);

    // Format the log message
    let logMessage = message;

    if (meta) {
      logMessage += ` ${JSON.stringify(meta)}`;
    }

    if (error) {
      logMessage += ` Error: ${error.message}`;
      if (error.stack && variables.NODE_ENV === "development") {
        logMessage += `\nStack: ${error.stack}`;
      }
    }

    // Log using debug
    debugLogger(logMessage);

    // In production, also log errors to console for visibility
    if (level === "error" && variables.NODE_ENV === "production") {
      console.error(`[${namespace}:${level}] ${logMessage}`);
    }
  };
}

/**
 * Initialize loggers for all namespaces and levels
 */
function initializeLoggers(ns: readonly string[], levels: readonly string[]) {
  const loggers: Record<
    string,
    Record<string, ReturnType<typeof createLogger>>
  > = {};

  for (const namespace of ns) {
    loggers[namespace] = {};
    for (const level of levels) {
      loggers[namespace][level] = createLogger(namespace, level);
    }
  }

  return loggers as {
    [K in Namespace]: {
      [L in LogLevel]: (
        message: string,
        meta?: Record<string, any>,
        error?: Error
      ) => void;
    };
  };
}

// Environment-specific patterns
const patterns = {
  development: createDebugPatterns(namespaces, logLevels),
  production: createDebugPatterns(namespaces, ["error"] as const),
};

const DEBUG = patterns[variables.NODE_ENV];

// Enable debugging immediately when this module is imported
debug.enable(DEBUG);

// Create the logger interface
export const logger = initializeLoggers(namespaces, logLevels);

// Backward compatibility - keeping the old 'hello' export
export const hello = logger;

/**
 * Structured logging with automatic Prometheus metrics
 */
export class StructuredLogger {
  constructor(private namespace: Namespace) {}

  info(message: string, meta?: Record<string, any>) {
    logger[this.namespace].info(message, meta);
  }

  warn(message: string, meta?: Record<string, any>) {
    logger[this.namespace].warn(message, meta);
  }

  debug(message: string, meta?: Record<string, any>) {
    logger[this.namespace].debug(message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, any>) {
    logger[this.namespace].error(message, meta, error);
  }

  /**
   * Log with automatic timing and metrics
   */
  async timed<T>(
    operation: string,
    fn: () => Promise<T>,
    meta?: Record<string, any>
  ): Promise<T> {
    const startTime = performance.now();
    this.debug(`Starting ${operation}`, meta);

    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      this.info(`Completed ${operation}`, {
        ...meta,
        duration: `${duration.toFixed(2)}ms`,
      });
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.error(`Failed ${operation}`, error as Error, {
        ...meta,
        duration: `${duration.toFixed(2)}ms`,
      });
      throw error;
    }
  }
}

/**
 * Create a structured logger for a specific namespace
 */
export function createStructuredLogger(namespace: Namespace): StructuredLogger {
  return new StructuredLogger(namespace);
}

/**
 * Get current log metrics for monitoring
 */
export function getLogMetrics() {
  return {
    totalLogs: logCounter,
    errorLogs: errorLogCounter,
    logRate: logRateGauge,
  };
}

/**
 * Export log level constants for external use
 */
export { namespaces, logLevels };
export type { Namespace, LogLevel };
