import pino from "pino";
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
 * Create pino logger with appropriate configuration
 */
const pinoLogger = pino({
  level: variables.NODE_ENV === "development" ? "debug" : "info",
  transport:
    variables.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss Z",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
});

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
  return (message: string, meta?: Record<string, any>, error?: Error) => {
    // Record metrics first
    recordLogMetrics(namespace, level, message, error);

    // Create log object
    const logObj: any = {
      namespace,
      message,
      ...meta,
    };

    if (error) {
      logObj.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }

    // Log using pino with appropriate level
    switch (level) {
      case "info":
        pinoLogger.info(logObj, message);
        break;
      case "warn":
        pinoLogger.warn(logObj, message);
        break;
      case "debug":
        pinoLogger.debug(logObj, message);
        break;
      case "error":
        pinoLogger.error(logObj, message);
        break;
      default:
        pinoLogger.info(logObj, message);
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
